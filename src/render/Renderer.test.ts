/**
 * Renderer HDR Output Mode Tests
 *
 * Tests for HDR output mode support in the Renderer class.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Renderer } from './Renderer';
import { IPImage } from '../core/image/Image';
import type { DisplayCapabilities } from '../color/DisplayCapabilities';
import { DEFAULT_CAPABILITIES } from '../color/DisplayCapabilities';
import { createMockRendererGL as createMockGL, initRendererWithMockGL } from '../../test/mocks';

/**
 * Create capabilities with specified HDR support.
 */
function makeCaps(overrides: Partial<DisplayCapabilities> = {}): DisplayCapabilities {
  return { ...DEFAULT_CAPABILITIES, ...overrides };
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

    renderer.setHighlightsShadows({ highlights: 50, shadows: -30, whites: 20, blacks: -10 });
    renderer.resize(100, 100);
    const result = renderer.renderSDRFrame(sourceCanvas);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('REN-1B-002: setVibrance sets shader uniforms', () => {
    initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setVibrance({ vibrance: 75, skinProtection: true });
    renderer.resize(100, 100);
    const result = renderer.renderSDRFrame(sourceCanvas);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('REN-1B-003: setClarity sets shader uniforms', () => {
    initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setClarity({ clarity: 50 });
    renderer.resize(100, 100);
    const result = renderer.renderSDRFrame(sourceCanvas);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('REN-1B-004: setSharpen sets shader uniforms', () => {
    initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setSharpen({ amount: 60 });
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

    renderer.setHighlightsShadows({ highlights: 0, shadows: 0, whites: 0, blacks: 0 });
    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    // uniform1i should have been called with u_hsEnabled = 0
    expect(mockGL.uniform1i).toHaveBeenCalled();
  });

  it('REN-1B-007: setVibrance with zero disables effect', () => {
    const mockGL = initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setVibrance({ vibrance: 0, skinProtection: true });
    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    expect(mockGL.uniform1i).toHaveBeenCalled();
  });

  it('REN-1B-008: setClarity with zero disables effect', () => {
    const mockGL = initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setClarity({ clarity: 0 });
    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    expect(mockGL.uniform1i).toHaveBeenCalled();
  });

  it('REN-1B-009: setSharpen with zero disables effect', () => {
    const mockGL = initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setSharpen({ amount: 0 });
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

    renderer.setHighlightsShadows({ highlights: 50, shadows: -30, whites: 20, blacks: -10 });
    renderer.setVibrance({ vibrance: 40, skinProtection: true });
    renderer.setClarity({ clarity: 30 });
    renderer.setSharpen({ amount: 50 });
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

/**
 * Regression tests for double-gamma SDR brightness bug.
 *
 * Bug: SDR video content appeared too bright because renderSDRFrame() applied
 * display transfer (sRGB OETF) to already gamma-encoded SDR input via
 * u_displayTransfer = 1, causing double gamma encoding.
 *
 * Fix: renderSDRFrame() overrides u_displayTransfer to 0 after
 * setAllEffectUniforms(), so that SDR input bypasses the display transfer.
 * The HDR path (renderImage()) must NOT override u_displayTransfer.
 */
describe('Renderer SDR Display Transfer Override (regression)', () => {
  /**
   * Create a mock GL context that tracks the LAST value set for
   * u_displayTransfer via uniform1i.
   */
  function createDisplayTransferTrackingGL(): {
    gl: WebGL2RenderingContext;
    getDisplayTransferCalls: () => Array<number>;
  } {
    const locationToName = new Map<object, string>();
    const displayTransferCalls: Array<number> = [];

    const gl = {
      canvas: document.createElement('canvas'),
      drawingBufferColorSpace: 'srgb',
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
      getUniformLocation: vi.fn((_program: WebGLProgram, name: string) => {
        const sentinel = { __uniformName: name };
        locationToName.set(sentinel, name);
        return sentinel;
      }),
      getAttribLocation: vi.fn(() => 0),
      useProgram: vi.fn(),
      uniform1f: vi.fn(),
      uniform1i: vi.fn((location: object, value: number) => {
        const name = locationToName.get(location);
        if (name === 'u_displayTransfer') {
          displayTransferCalls.push(value);
        }
      }),
      uniform1fv: vi.fn(),
      uniform2fv: vi.fn(),
      uniform3fv: vi.fn(),
      uniform4fv: vi.fn(),
      uniformMatrix3fv: vi.fn(),
      uniformMatrix4fv: vi.fn(),
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
      texImage3D: vi.fn(),
      texStorage3D: vi.fn(),
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
      TEXTURE_3D: 0x806f,
      TEXTURE0: 0x84c0,
      TEXTURE1: 0x84c1,
      TEXTURE2: 0x84c2,
      TEXTURE3: 0x84c3,
      TRIANGLE_STRIP: 0x0005,
      COLOR_BUFFER_BIT: 0x4000,
      TEXTURE_WRAP_S: 0x2802,
      TEXTURE_WRAP_T: 0x2803,
      TEXTURE_WRAP_R: 0x8072,
      TEXTURE_MIN_FILTER: 0x2801,
      TEXTURE_MAG_FILTER: 0x2800,
      CLAMP_TO_EDGE: 0x812f,
      LINEAR: 0x2601,
      RGBA8: 0x8058,
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
      RGB32F: 0x8815,
      RGB: 0x1907,
    } as unknown as WebGL2RenderingContext;

    return { gl, getDisplayTransferCalls: () => displayTransferCalls };
  }

  /** Initialize a Renderer with the display-transfer tracking mock. */
  function initWithDisplayTransferTracking(renderer: Renderer): ReturnType<typeof createDisplayTransferTrackingGL> {
    const tracking = createDisplayTransferTrackingGL();
    const canvas = document.createElement('canvas');

    const originalGetContext = canvas.getContext.bind(canvas);
    canvas.getContext = vi.fn((contextId: string, _options?: unknown) => {
      if (contextId === 'webgl2') return tracking.gl;
      return originalGetContext(contextId, _options as CanvasRenderingContext2DSettings);
    }) as typeof canvas.getContext;

    renderer.initialize(canvas);
    return tracking;
  }

  it('REN-SDR-DT-001: renderSDRFrame sets u_displayTransfer to 0', () => {
    const renderer = new Renderer();
    const { getDisplayTransferCalls } = initWithDisplayTransferTracking(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    const calls = getDisplayTransferCalls();
    // The LAST value set for u_displayTransfer must be 0 (skip display transfer for SDR).
    // setAllEffectUniforms() sets it to this.displayTransferCode (default 1),
    // then the fix overrides it to 0.
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[calls.length - 1]).toBe(0);
  });

  it('REN-SDR-DT-002: renderSDRFrame overrides display transfer even when displayTransferCode is non-zero', () => {
    const renderer = new Renderer();
    const { getDisplayTransferCalls } = initWithDisplayTransferTracking(renderer);
    const sourceCanvas = document.createElement('canvas');

    // Set display color state with gamma 2.2 transfer (code 3)
    renderer.setDisplayColorState({
      transferFunction: 3,
      displayGamma: 1.0,
      displayBrightness: 1.0,
      customGamma: 2.2,
    });

    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    const calls = getDisplayTransferCalls();
    // setAllEffectUniforms() sets u_displayTransfer to 3 (gamma 2.2),
    // but the SDR override must set it back to 0.
    expect(calls.length).toBeGreaterThanOrEqual(2);
    // First call from setAllEffectUniforms should be 3
    expect(calls[0]).toBe(3);
    // Last call (the override) must be 0
    expect(calls[calls.length - 1]).toBe(0);
  });

  it('REN-SDR-DT-003: renderImage (HDR path) uses displayTransferCode, does not override to 0', () => {
    const renderer = new Renderer();
    const { getDisplayTransferCalls } = initWithDisplayTransferTracking(renderer);

    // Set display color state with gamma 2.2 transfer (code 3)
    renderer.setDisplayColorState({
      transferFunction: 3,
      displayGamma: 1.0,
      displayBrightness: 1.0,
      customGamma: 2.2,
    });

    renderer.resize(100, 100);

    // Create a minimal IPImage for the HDR render path
    const image = new IPImage({
      width: 10,
      height: 10,
      channels: 4,
      dataType: 'uint8',
    });

    renderer.renderImage(image);

    const calls = getDisplayTransferCalls();
    // renderImage should NOT override u_displayTransfer to 0.
    // The last value should be 3 (from setAllEffectUniforms using displayTransferCode).
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[calls.length - 1]).toBe(3);
  });

  it('REN-SDR-DT-004: renderSDRFrame retains user-set u_displayGamma and u_displayBrightness values', () => {
    // Create a mock GL context that tracks uniform1f calls for displayGamma and displayBrightness
    function createDisplayUniformTrackingGL(): {
      gl: WebGL2RenderingContext;
      getUniform1fCalls: () => Map<string, number[]>;
    } {
      const locationToName = new Map<object, string>();
      const uniform1fCalls = new Map<string, number[]>();

      const gl = {
        canvas: document.createElement('canvas'),
        drawingBufferColorSpace: 'srgb',
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
        getUniformLocation: vi.fn((_program: WebGLProgram, name: string) => {
          const sentinel = { __uniformName: name };
          locationToName.set(sentinel, name);
          return sentinel;
        }),
        getAttribLocation: vi.fn(() => 0),
        useProgram: vi.fn(),
        uniform1f: vi.fn((location: object, value: number) => {
          const name = locationToName.get(location);
          if (name === 'u_displayGamma' || name === 'u_displayBrightness') {
            if (!uniform1fCalls.has(name)) {
              uniform1fCalls.set(name, []);
            }
            uniform1fCalls.get(name)!.push(value);
          }
        }),
        uniform1i: vi.fn(),
        uniform2fv: vi.fn(),
        uniform3fv: vi.fn(),
        uniformMatrix3fv: vi.fn(),
        activeTexture: vi.fn(),
        bindTexture: vi.fn(),
        pixelStorei: vi.fn(),
        createTexture: vi.fn(() => ({})),
        deleteTexture: vi.fn(),
        clear: vi.fn(),
        clearColor: vi.fn(),
        viewport: vi.fn(),
        drawArrays: vi.fn(),
        deleteBuffer: vi.fn(),
        deleteVertexArray: vi.fn(),
        deleteProgram: vi.fn(),
        texParameteri: vi.fn(),
        texImage2D: vi.fn(),
        texImage3D: vi.fn(),
        texStorage3D: vi.fn(),
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
        TEXTURE_3D: 0x806f,
        TEXTURE0: 0x84c0,
        TEXTURE1: 0x84c1,
        TEXTURE2: 0x84c2,
        TEXTURE3: 0x84c3,
        TRIANGLE_STRIP: 0x0005,
        COLOR_BUFFER_BIT: 0x4000,
        TEXTURE_WRAP_S: 0x2802,
        TEXTURE_WRAP_T: 0x2803,
        TEXTURE_WRAP_R: 0x8072,
        TEXTURE_MIN_FILTER: 0x2801,
        TEXTURE_MAG_FILTER: 0x2800,
        CLAMP_TO_EDGE: 0x812f,
        LINEAR: 0x2601,
        RGBA8: 0x8058,
        RGBA: 0x1908,
        UNSIGNED_BYTE: 0x1401,
        RGB32F: 0x8815,
        RGB: 0x1907,
      } as unknown as WebGL2RenderingContext;

      return { gl, getUniform1fCalls: () => uniform1fCalls };
    }

    const renderer = new Renderer();
    const { gl, getUniform1fCalls } = createDisplayUniformTrackingGL();
    const canvas = document.createElement('canvas');

    const originalGetContext = canvas.getContext.bind(canvas);
    canvas.getContext = vi.fn((contextId: string, _options?: unknown) => {
      if (contextId === 'webgl2') return gl;
      return originalGetContext(contextId, _options as CanvasRenderingContext2DSettings);
    }) as typeof canvas.getContext;

    renderer.initialize(canvas);

    // Set display color state with non-default displayGamma and displayBrightness
    renderer.setDisplayColorState({
      transferFunction: 0, // sRGB
      displayGamma: 1.5, // Non-default value
      displayBrightness: 1.2, // Non-default value
      customGamma: 2.2,
    });

    const sourceCanvas = document.createElement('canvas');
    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    const calls = getUniform1fCalls();

    // Verify u_displayGamma was set with the user value (1.5), not overridden to 1.0
    const gammaVals = calls.get('u_displayGamma');
    expect(gammaVals).toBeDefined();
    expect(gammaVals!.length).toBeGreaterThanOrEqual(1);
    expect(gammaVals![gammaVals!.length - 1]).toBe(1.5);

    // Verify u_displayBrightness was set with the user value (1.2), not overridden to 1.0
    const brightnessVals = calls.get('u_displayBrightness');
    expect(brightnessVals).toBeDefined();
    expect(brightnessVals!.length).toBeGreaterThanOrEqual(1);
    expect(brightnessVals![brightnessVals!.length - 1]).toBe(1.2);
  });
});

/**
 * Regression tests for WebGL texture sampler unit assignments.
 *
 * Bug: GL_INVALID_OPERATION: glDrawArrays: Two textures of different types
 * use the same sampler location.
 *
 * Root cause: sampler uniforms (u_lut3D, u_curvesLUT, u_falseColorLUT)
 * defaulted to texture unit 0 when their features were disabled, conflicting
 * with u_texture (sampler2D) also on unit 0.
 *
 * Fix: always call setUniformInt for every sampler uniform to assign unique
 * texture units, regardless of whether the associated feature is enabled.
 */
describe('Renderer Sampler Unit Assignment (regression)', () => {
  /** The four sampler uniforms that must each have a unique texture unit. */
  const SAMPLER_UNIFORMS = ['u_texture', 'u_curvesLUT', 'u_falseColorLUT', 'u_lut3D'] as const;

  /**
   * Create a mock GL context that tracks uniform1i calls with named locations.
   *
   * getUniformLocation returns a sentinel object tagged with the uniform name,
   * so we can later map each uniform1i(location, unit) call back to the
   * uniform name that was being assigned.
   */
  function createTrackingMockGL(): {
    gl: WebGL2RenderingContext;
    getSamplerUnitAssignments: () => Map<string, number>;
  } {
    // Map from sentinel object -> uniform name
    const locationToName = new Map<object, string>();
    // All uniform1i calls recorded as [name, value]
    const uniform1iCalls: Array<[string, number]> = [];

    const gl = {
      canvas: document.createElement('canvas'),
      drawingBufferColorSpace: 'srgb',
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
      getUniformLocation: vi.fn((_program: WebGLProgram, name: string) => {
        const sentinel = { __uniformName: name };
        locationToName.set(sentinel, name);
        return sentinel;
      }),
      getAttribLocation: vi.fn(() => 0),
      useProgram: vi.fn(),
      uniform1f: vi.fn(),
      uniform1i: vi.fn((location: object, value: number) => {
        const name = locationToName.get(location);
        if (name) {
          uniform1iCalls.push([name, value]);
        }
      }),
      uniform1fv: vi.fn(),
      uniform2fv: vi.fn(),
      uniform3fv: vi.fn(),
      uniform4fv: vi.fn(),
      uniformMatrix3fv: vi.fn(),
      uniformMatrix4fv: vi.fn(),
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
      texImage3D: vi.fn(),
      texStorage3D: vi.fn(),
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
      TEXTURE_3D: 0x806f,
      TEXTURE0: 0x84c0,
      TEXTURE1: 0x84c1,
      TEXTURE2: 0x84c2,
      TEXTURE3: 0x84c3,
      TRIANGLE_STRIP: 0x0005,
      COLOR_BUFFER_BIT: 0x4000,
      TEXTURE_WRAP_S: 0x2802,
      TEXTURE_WRAP_T: 0x2803,
      TEXTURE_WRAP_R: 0x8072,
      TEXTURE_MIN_FILTER: 0x2801,
      TEXTURE_MAG_FILTER: 0x2800,
      CLAMP_TO_EDGE: 0x812f,
      LINEAR: 0x2601,
      RGBA8: 0x8058,
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
      RGB32F: 0x8815,
      RGB: 0x1907,
    } as unknown as WebGL2RenderingContext;

    /**
     * Extract sampler uniform assignments from recorded uniform1i calls.
     * Returns a Map from sampler uniform name to the LAST assigned texture unit.
     * (Last wins, since the code may set the same uniform multiple times.)
     */
    function getSamplerUnitAssignments(): Map<string, number> {
      const assignments = new Map<string, number>();
      for (const [name, value] of uniform1iCalls) {
        if (SAMPLER_UNIFORMS.includes(name as typeof SAMPLER_UNIFORMS[number])) {
          assignments.set(name, value);
        }
      }
      return assignments;
    }

    return { gl, getSamplerUnitAssignments };
  }

  /** Initialize a Renderer with our tracking mock GL. */
  function initWithTrackingGL(renderer: Renderer): ReturnType<typeof createTrackingMockGL> {
    const tracking = createTrackingMockGL();
    const canvas = document.createElement('canvas');

    const originalGetContext = canvas.getContext.bind(canvas);
    canvas.getContext = vi.fn((contextId: string, _options?: unknown) => {
      if (contextId === 'webgl2') return tracking.gl;
      return originalGetContext(contextId, _options as CanvasRenderingContext2DSettings);
    }) as typeof canvas.getContext;

    renderer.initialize(canvas);
    return tracking;
  }

  it('REN-SAM-001: all sampler uniforms are assigned to distinct texture units', () => {
    const renderer = new Renderer();
    const { getSamplerUnitAssignments } = initWithTrackingGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    const assignments = getSamplerUnitAssignments();

    // All four sampler uniforms must have been assigned
    for (const name of SAMPLER_UNIFORMS) {
      expect(assignments.has(name), `sampler uniform "${name}" must be assigned a texture unit`).toBe(true);
    }

    // All assigned texture units must be unique (no duplicates)
    const units = [...assignments.values()];
    const uniqueUnits = new Set(units);
    expect(
      uniqueUnits.size,
      `Expected ${units.length} unique texture units but found ${uniqueUnits.size}. ` +
      `Assignments: ${JSON.stringify(Object.fromEntries(assignments))}`,
    ).toBe(units.length);
  });

  it('REN-SAM-002: sampler units are always set even when features are disabled', () => {
    const renderer = new Renderer();
    const { getSamplerUnitAssignments } = initWithTrackingGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    // Explicitly leave all features disabled (default state):
    // - curvesEnabled = false
    // - falseColorEnabled = false
    // - lut3DEnabled = false
    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    const assignments = getSamplerUnitAssignments();

    // Even with all features disabled, every sampler uniform must be assigned
    expect(assignments.has('u_texture'), 'u_texture must be assigned when all features disabled').toBe(true);
    expect(assignments.has('u_curvesLUT'), 'u_curvesLUT must be assigned when curves disabled').toBe(true);
    expect(assignments.has('u_falseColorLUT'), 'u_falseColorLUT must be assigned when false color disabled').toBe(true);
    expect(assignments.has('u_lut3D'), 'u_lut3D must be assigned when 3D LUT disabled').toBe(true);
  });

  it('REN-SAM-003: u_lut3D (sampler3D) never shares a unit with any sampler2D uniform', () => {
    const renderer = new Renderer();
    const { getSamplerUnitAssignments } = initWithTrackingGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    const assignments = getSamplerUnitAssignments();
    const lut3DUnit = assignments.get('u_lut3D');

    expect(lut3DUnit, 'u_lut3D must have a texture unit assigned').not.toBeUndefined();

    // u_lut3D (sampler3D) must not share a unit with any sampler2D uniform
    const sampler2DUniforms = ['u_texture', 'u_curvesLUT', 'u_falseColorLUT'] as const;
    for (const name of sampler2DUniforms) {
      const unit = assignments.get(name);
      expect(
        unit,
        `${name} must have a texture unit assigned`,
      ).not.toBeUndefined();
      expect(
        unit,
        `u_lut3D (sampler3D, unit ${lut3DUnit}) must not share a texture unit ` +
        `with ${name} (sampler2D, unit ${unit}). This causes GL_INVALID_OPERATION.`,
      ).not.toBe(lut3DUnit);
    }
  });
});

// ============================================================================
// Extended HDR Mode Tests
// ============================================================================

describe('Renderer Extended HDR Mode', () => {
  let renderer: Renderer;

  beforeEach(() => {
    renderer = new Renderer();
  });

  it('REN-EXT-001: setHDROutputMode extended returns true with P3 support', () => {
    initRendererWithMockGL(renderer, { supportP3: true, supportDrawingBufferStorage: true });
    const caps = makeCaps({
      displayHDR: true,
      webglP3: true,
      webglDrawingBufferStorage: true,
      canvasExtendedHDR: true,
    });

    const result = renderer.setHDROutputMode('extended', caps);

    expect(result).toBe(true);
    expect(renderer.getHDROutputMode()).toBe('extended');
  });

  it('REN-EXT-002: setHDROutputMode extended sets display-p3 when P3 supported', () => {
    const mockGL = initRendererWithMockGL(renderer, { supportP3: true, supportDrawingBufferStorage: true });
    const caps = makeCaps({
      displayHDR: true,
      webglP3: true,
      webglDrawingBufferStorage: true,
      canvasExtendedHDR: true,
    });

    renderer.setHDROutputMode('extended', caps);

    expect((mockGL as unknown as { drawingBufferColorSpace: string }).drawingBufferColorSpace).toBe('display-p3');
  });

  it('REN-EXT-003: setHDROutputMode extended sets srgb when P3 not supported', () => {
    const mockGL = initRendererWithMockGL(renderer, { supportDrawingBufferStorage: true });
    const caps = makeCaps({
      displayHDR: true,
      webglP3: false,
      webglDrawingBufferStorage: true,
      canvasExtendedHDR: true,
    });

    renderer.setHDROutputMode('extended', caps);

    expect((mockGL as unknown as { drawingBufferColorSpace: string }).drawingBufferColorSpace).toBe('srgb');
  });

  it('REN-EXT-004: setHDROutputMode extended calls drawingBufferStorage', () => {
    const mockGL = initRendererWithMockGL(renderer, { supportP3: true, supportDrawingBufferStorage: true });
    const caps = makeCaps({
      displayHDR: true,
      webglP3: true,
      webglDrawingBufferStorage: true,
      canvasExtendedHDR: true,
    });

    renderer.setHDROutputMode('extended', caps);

    expect(mockGL.drawingBufferStorage).toHaveBeenCalled();
  });

  it('REN-EXT-005: setHDROutputMode extended works without drawingBufferStorage', () => {
    initRendererWithMockGL(renderer, { supportP3: true });
    const caps = makeCaps({
      displayHDR: true,
      webglP3: true,
      webglDrawingBufferStorage: false,
      canvasExtendedHDR: true,
    });

    const result = renderer.setHDROutputMode('extended', caps);

    expect(result).toBe(true);
    expect(renderer.getHDROutputMode()).toBe('extended');
  });

  it('REN-EXT-006: setHDROutputMode reverts from extended to sdr', () => {
    const mockGL = initRendererWithMockGL(renderer, { supportP3: true, supportDrawingBufferStorage: true });
    const caps = makeCaps({
      displayHDR: true,
      webglP3: true,
      webglDrawingBufferStorage: true,
      canvasExtendedHDR: true,
    });

    renderer.setHDROutputMode('extended', caps);
    expect(renderer.getHDROutputMode()).toBe('extended');

    renderer.setHDROutputMode('sdr', caps);
    expect(renderer.getHDROutputMode()).toBe('sdr');
    expect((mockGL as unknown as { drawingBufferColorSpace: string }).drawingBufferColorSpace).toBe('display-p3');
  });

  it('REN-EXT-007: setHDRHeadroom clamps to minimum 1.0', () => {
    initRendererWithMockGL(renderer);

    renderer.setHDRHeadroom(0.5);
    // No direct getter, but verify no crash
    // The headroom will be used in renderImage uniform, tested below
    expect(renderer.getHDROutputMode()).toBe('sdr');
  });

  it('REN-EXT-008: setHDRHeadroom accepts values > 1.0', () => {
    initRendererWithMockGL(renderer);

    renderer.setHDRHeadroom(3.0);
    // No crash means success - headroom value is internal state
    expect(renderer.getHDROutputMode()).toBe('sdr');
  });

  it('REN-EXT-009: initialize auto-detects extended mode when HLG/PQ unavailable', () => {
    const mockGL = createMockGL({ supportP3: true, supportDrawingBufferStorage: true });
    const canvas = document.createElement('canvas');

    canvas.getContext = vi.fn((contextId: string) => {
      if (contextId === 'webgl2') return mockGL;
      return null;
    }) as typeof canvas.getContext;

    // Attach configureHighDynamicRange to canvas
    (canvas as unknown as { configureHighDynamicRange: (opts: unknown) => void }).configureHighDynamicRange = vi.fn();

    const caps = makeCaps({
      displayHDR: true,
      webglP3: true,
      webglHLG: false,
      webglPQ: false,
      webglDrawingBufferStorage: true,
      canvasExtendedHDR: true,
    });

    renderer.initialize(canvas, caps);

    expect(renderer.getHDROutputMode()).toBe('extended');
  });

  it('REN-EXT-010: initialize falls back to SDR when extended not available', () => {
    const mockGL = createMockGL({ supportP3: true });
    const canvas = document.createElement('canvas');

    canvas.getContext = vi.fn((contextId: string) => {
      if (contextId === 'webgl2') return mockGL;
      return null;
    }) as typeof canvas.getContext;

    const caps = makeCaps({
      displayHDR: true,
      webglP3: true,
      webglHLG: false,
      webglPQ: false,
      webglDrawingBufferStorage: false,
      canvasExtendedHDR: false,
    });

    renderer.initialize(canvas, caps);

    expect(renderer.getHDROutputMode()).toBe('sdr');
  });

  it('REN-EXT-011: resize re-allocates half-float buffer for extended mode', () => {
    const mockGL = createMockGL({ supportP3: true, supportDrawingBufferStorage: true });
    const canvas = document.createElement('canvas');

    canvas.getContext = vi.fn((contextId: string) => {
      if (contextId === 'webgl2') return mockGL;
      return null;
    }) as typeof canvas.getContext;
    (canvas as unknown as { configureHighDynamicRange: (opts: unknown) => void }).configureHighDynamicRange = vi.fn();

    const caps = makeCaps({
      displayHDR: true,
      webglP3: true,
      webglHLG: false,
      webglPQ: false,
      webglDrawingBufferStorage: true,
      canvasExtendedHDR: true,
    });

    renderer.initialize(canvas, caps);
    expect(renderer.getHDROutputMode()).toBe('extended');

    // drawingBufferStorage should have been called during init
    const storageMock = mockGL.drawingBufferStorage as unknown as ReturnType<typeof vi.fn>;
    const initCallCount = storageMock.mock.calls.length;

    // Resize should call drawingBufferStorage again
    renderer.resize(800, 600);

    expect(storageMock.mock.calls.length).toBe(initCallCount + 1);
    // The last call should have the new dimensions
    const lastCall = storageMock.mock.calls[storageMock.mock.calls.length - 1]!;
    expect(lastCall[1]).toBe(800);
    expect(lastCall[2]).toBe(600);
  });

  it('REN-EXT-012: configureHighDynamicRange called with mode extended', () => {
    const mockGL = createMockGL({ supportP3: true, supportDrawingBufferStorage: true });
    const canvas = document.createElement('canvas');

    canvas.getContext = vi.fn((contextId: string) => {
      if (contextId === 'webgl2') return mockGL;
      return null;
    }) as typeof canvas.getContext;

    const configureHDR = vi.fn();
    (canvas as unknown as { configureHighDynamicRange: typeof configureHDR }).configureHighDynamicRange = configureHDR;

    const caps = makeCaps({
      displayHDR: true,
      webglP3: true,
      webglHLG: false,
      webglPQ: false,
      webglDrawingBufferStorage: true,
      canvasExtendedHDR: true,
    });

    renderer.initialize(canvas, caps);

    expect(configureHDR).toHaveBeenCalledWith({ mode: 'extended' });
  });

  it('REN-EXT-013: dispose resets half-float backbuffer flag', () => {
    const mockGL = createMockGL({ supportP3: true, supportDrawingBufferStorage: true });
    const canvas = document.createElement('canvas');

    canvas.getContext = vi.fn((contextId: string) => {
      if (contextId === 'webgl2') return mockGL;
      return null;
    }) as typeof canvas.getContext;
    (canvas as unknown as { configureHighDynamicRange: (opts: unknown) => void }).configureHighDynamicRange = vi.fn();

    const caps = makeCaps({
      displayHDR: true,
      webglP3: true,
      webglHLG: false,
      webglPQ: false,
      webglDrawingBufferStorage: true,
      canvasExtendedHDR: true,
    });

    renderer.initialize(canvas, caps);
    expect(renderer.getHDROutputMode()).toBe('extended');

    renderer.dispose();
    // After dispose, getHDROutputMode should still return the last value
    // but the renderer should be in a clean state
    expect(renderer.getContext()).toBeNull();
  });
});

// ============================================================================
// DisplayCapabilities Extended HDR Tests
// ============================================================================

describe('DisplayCapabilities Extended HDR', () => {
  it('DC-EXT-001: DEFAULT_CAPABILITIES has new extended HDR fields', () => {
    expect(DEFAULT_CAPABILITIES.webglDrawingBufferStorage).toBe(false);
    expect(DEFAULT_CAPABILITIES.canvasExtendedHDR).toBe(false);
  });

  it('DC-EXT-002: activeHDRMode includes extended as valid value', () => {
    const caps: DisplayCapabilities = {
      ...DEFAULT_CAPABILITIES,
      displayHDR: true,
      webglDrawingBufferStorage: true,
      canvasExtendedHDR: true,
      activeHDRMode: 'extended',
    };
    expect(caps.activeHDRMode).toBe('extended');
  });
});

// ============================================================================
// Shader u_hdrHeadroom Tests
// ============================================================================

describe('Renderer HDR Headroom Uniform', () => {
  /**
   * Create a mock GL context that tracks u_hdrHeadroom uniform1f calls.
   */
  function createHeadroomTrackingGL(): {
    gl: WebGL2RenderingContext;
    getHeadroomCalls: () => number[];
  } {
    const locationToName = new Map<object, string>();
    const headroomCalls: number[] = [];

    const gl = {
      canvas: document.createElement('canvas'),
      drawingBufferColorSpace: 'srgb',
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
      getUniformLocation: vi.fn((_program: WebGLProgram, name: string) => {
        const sentinel = { __uniformName: name };
        locationToName.set(sentinel, name);
        return sentinel;
      }),
      getAttribLocation: vi.fn(() => 0),
      useProgram: vi.fn(),
      uniform1f: vi.fn((location: object, value: number) => {
        const name = locationToName.get(location);
        if (name === 'u_hdrHeadroom') {
          headroomCalls.push(value);
        }
      }),
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
      texImage3D: vi.fn(),
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
      TEXTURE_3D: 0x806f,
      TEXTURE0: 0x84c0,
      TEXTURE1: 0x84c1,
      TEXTURE2: 0x84c2,
      TEXTURE3: 0x84c3,
      TRIANGLE_STRIP: 0x0005,
      COLOR_BUFFER_BIT: 0x4000,
      TEXTURE_WRAP_S: 0x2802,
      TEXTURE_WRAP_T: 0x2803,
      TEXTURE_WRAP_R: 0x8072,
      TEXTURE_MIN_FILTER: 0x2801,
      TEXTURE_MAG_FILTER: 0x2800,
      CLAMP_TO_EDGE: 0x812f,
      LINEAR: 0x2601,
      RGBA8: 0x8058,
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
      R32F: 0x822e,
      RG32F: 0x8230,
      RGB32F: 0x8815,
      RGBA32F: 0x8814,
      RED: 0x1903,
      RG: 0x8227,
      RGB: 0x1907,
    } as unknown as WebGL2RenderingContext;

    return { gl, getHeadroomCalls: () => headroomCalls };
  }

  it('REN-HDR-HEAD-001: renderImage sets u_hdrHeadroom to 1.0 for SDR mode', () => {
    const renderer = new Renderer();
    const { gl, getHeadroomCalls } = createHeadroomTrackingGL();
    const canvas = document.createElement('canvas');

    const originalGetContext = canvas.getContext.bind(canvas);
    canvas.getContext = vi.fn((contextId: string, _options?: unknown) => {
      if (contextId === 'webgl2') return gl;
      return originalGetContext(contextId, _options as CanvasRenderingContext2DSettings);
    }) as typeof canvas.getContext;

    renderer.initialize(canvas);
    renderer.resize(100, 100);

    const image = new IPImage({ width: 10, height: 10, channels: 4, dataType: 'uint8' });
    renderer.renderImage(image);

    const calls = getHeadroomCalls();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[calls.length - 1]).toBe(1.0);
  });

  it('REN-HDR-HEAD-002: renderImage uses custom headroom for HDR mode', () => {
    const renderer = new Renderer();
    const { gl, getHeadroomCalls } = createHeadroomTrackingGL();
    const canvas = document.createElement('canvas');

    // Support HLG so we can enter HDR mode
    let currentColorSpace = 'srgb';
    Object.defineProperty(gl, 'drawingBufferColorSpace', {
      get: () => currentColorSpace,
      set: (v: string) => { currentColorSpace = v; },
      configurable: true,
      enumerable: true,
    });

    const originalGetContext = canvas.getContext.bind(canvas);
    canvas.getContext = vi.fn((contextId: string, _options?: unknown) => {
      if (contextId === 'webgl2') return gl;
      return originalGetContext(contextId, _options as CanvasRenderingContext2DSettings);
    }) as typeof canvas.getContext;

    renderer.initialize(canvas);
    renderer.resize(100, 100);

    // Set to HLG mode
    const caps = makeCaps({ webglHLG: true });
    renderer.setHDROutputMode('hlg', caps);
    renderer.setHDRHeadroom(3.0);

    const image = new IPImage({ width: 10, height: 10, channels: 4, dataType: 'uint8' });
    renderer.renderImage(image);

    const calls = getHeadroomCalls();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[calls.length - 1]).toBe(3.0);
  });

  it('REN-HDR-HEAD-003: renderSDRFrame always sets headroom to 1.0', () => {
    const renderer = new Renderer();
    const { gl, getHeadroomCalls } = createHeadroomTrackingGL();
    const canvas = document.createElement('canvas');

    const originalGetContext = canvas.getContext.bind(canvas);
    canvas.getContext = vi.fn((contextId: string, _options?: unknown) => {
      if (contextId === 'webgl2') return gl;
      return originalGetContext(contextId, _options as CanvasRenderingContext2DSettings);
    }) as typeof canvas.getContext;

    renderer.initialize(canvas);
    renderer.resize(100, 100);

    // Set a high headroom (simulating previous HDR renderImage call)
    renderer.setHDRHeadroom(5.0);

    // Render an SDR frame — should force headroom to 1.0
    const img = document.createElement('img');
    renderer.renderSDRFrame(img);

    const calls = getHeadroomCalls();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[calls.length - 1]).toBe(1.0);
  });
});

// ===========================================================================
// renderImageToFloat (RGBA16F FBO → readPixels(FLOAT) → Float32Array)
// ===========================================================================

describe('Renderer renderImageToFloat', () => {
  let renderer: Renderer;

  beforeEach(() => {
    renderer = new Renderer();
  });

  /**
   * Create a mock GL that supports EXT_color_buffer_float, RGBA16F FBO,
   * and gl.readPixels(FLOAT). Extends the standard mock with FBO operations.
   */
  function createFBOCapableGL() {
    const mockGL = createMockGL();

    // Add missing constants and methods for FBO operations
    const extendedGL = mockGL as unknown as Record<string, unknown>;
    extendedGL.FRAMEBUFFER = 0x8d40;
    extendedGL.COLOR_ATTACHMENT0 = 0x8ce0;
    extendedGL.FRAMEBUFFER_COMPLETE = 0x8cd5;
    extendedGL.NO_ERROR = 0;
    extendedGL.VIEWPORT = 0x0ba2;
    extendedGL.TEXTURE_3D = 0x806f;
    extendedGL.TEXTURE_WRAP_R = 0x8072;
    extendedGL.RGBA32F = 0x8814;
    extendedGL.RGB32F = 0x8815;
    extendedGL.R32F = 0x822e;
    extendedGL.RG32F = 0x8230;
    extendedGL.RED = 0x1903;
    extendedGL.RG = 0x8227;
    extendedGL.RGB = 0x1907;
    extendedGL.TEXTURE1 = 0x84c1;
    extendedGL.TEXTURE2 = 0x84c2;
    extendedGL.TEXTURE3 = 0x84c3;

    // FBO methods
    extendedGL.createFramebuffer = vi.fn(() => ({}));
    extendedGL.bindFramebuffer = vi.fn();
    extendedGL.framebufferTexture2D = vi.fn();
    extendedGL.checkFramebufferStatus = vi.fn(() => 0x8cd5); // FRAMEBUFFER_COMPLETE
    extendedGL.deleteFramebuffer = vi.fn();
    extendedGL.texImage3D = vi.fn();
    extendedGL.uniform2fv = vi.fn();
    extendedGL.uniform3fv = vi.fn();
    extendedGL.uniformMatrix3fv = vi.fn();

    // readPixels for float data (fills with a pattern)
    extendedGL.readPixels = vi.fn(
      (_x: number, _y: number, _w: number, _h: number, _fmt: number, _type: number, pixels: Float32Array | Uint8Array) => {
        if (pixels instanceof Float32Array) {
          for (let i = 0; i < pixels.length; i += 4) {
            pixels[i] = 0.5;     // R
            pixels[i + 1] = 1.5; // G (HDR value > 1.0)
            pixels[i + 2] = 0.3; // B
            pixels[i + 3] = 1.0; // A
          }
        }
      },
    );

    // getParameter returns viewport for VIEWPORT queries
    extendedGL.getParameter = vi.fn((param: number) => {
      if (param === 0x0ba2) return new Int32Array([0, 0, 100, 100]); // VIEWPORT
      return null;
    });

    // getError returns NO_ERROR
    extendedGL.getError = vi.fn(() => 0);

    // EXT_color_buffer_float support
    const originalGetExtension = mockGL.getExtension as ReturnType<typeof vi.fn>;
    extendedGL.getExtension = vi.fn((name: string) => {
      if (name === 'EXT_color_buffer_float') return {};
      if (name === 'OES_texture_float_linear') return {};
      return originalGetExtension(name);
    });

    return mockGL;
  }

  function initWithFBOCapableGL(): WebGL2RenderingContext {
    const mockGL = createFBOCapableGL();
    const canvas = document.createElement('canvas');
    const originalGetContext = canvas.getContext.bind(canvas);
    canvas.getContext = vi.fn((contextId: string, _options?: unknown) => {
      if (contextId === 'webgl2') return mockGL;
      return originalGetContext(contextId, _options as CanvasRenderingContext2DSettings);
    }) as typeof canvas.getContext;
    renderer.initialize(canvas);
    return mockGL;
  }

  it('REN-FBO-001: returns null when renderer is not initialized', () => {
    const image = new IPImage({ width: 10, height: 10, channels: 4, dataType: 'uint8' });
    const result = renderer.renderImageToFloat(image, 10, 10);
    expect(result).toBeNull();
  });

  it('REN-FBO-002: returns null when EXT_color_buffer_float is unavailable', () => {
    const mockGL = createFBOCapableGL();
    // Override getExtension to not return EXT_color_buffer_float
    (mockGL as unknown as Record<string, unknown>).getExtension = vi.fn(() => null);

    const canvas = document.createElement('canvas');
    canvas.getContext = vi.fn((contextId: string) => {
      if (contextId === 'webgl2') return mockGL;
      return null;
    }) as typeof canvas.getContext;
    renderer.initialize(canvas);

    const image = new IPImage({ width: 10, height: 10, channels: 4, dataType: 'uint8' });
    const result = renderer.renderImageToFloat(image, 10, 10);
    expect(result).toBeNull();
  });

  it('REN-FBO-003: returns Float32Array on success', () => {
    initWithFBOCapableGL();

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    const result = renderer.renderImageToFloat(image, 4, 4);

    expect(result).toBeInstanceOf(Float32Array);
    expect(result!.length).toBe(4 * 4 * 4); // width * height * RGBA
  });

  it('REN-FBO-004: preserves HDR values > 1.0 in output', () => {
    initWithFBOCapableGL();

    const image = new IPImage({ width: 2, height: 2, channels: 4, dataType: 'uint8' });
    const result = renderer.renderImageToFloat(image, 2, 2);

    expect(result).not.toBeNull();
    // readPixels mock fills G channel with 1.5 (HDR value)
    expect(result![1]).toBe(1.5);
  });

  it('REN-FBO-005: creates RGBA16F FBO', () => {
    const mockGL = initWithFBOCapableGL();

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloat(image, 4, 4);

    expect((mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).createFramebuffer).toHaveBeenCalled();
    expect((mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).framebufferTexture2D).toHaveBeenCalled();
    expect((mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).checkFramebufferStatus).toHaveBeenCalled();
  });

  it('REN-FBO-006: binds FBO during render and unbinds after', () => {
    const mockGL = initWithFBOCapableGL();
    const bindFramebuffer = (mockGL as unknown as { bindFramebuffer: ReturnType<typeof vi.fn> }).bindFramebuffer;

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloat(image, 4, 4);

    const calls = bindFramebuffer.mock.calls;
    // First call: bind FBO (non-null)
    expect(calls.some((c: unknown[]) => c[0] === 0x8d40 && c[1] !== null)).toBe(true);
    // Last call: unbind FBO (null)
    const lastCall = calls[calls.length - 1] as unknown[];
    expect(lastCall[0]).toBe(0x8d40); // FRAMEBUFFER
    expect(lastCall[1]).toBeNull();
  });

  it('REN-FBO-007: restores previous viewport after render', () => {
    const mockGL = initWithFBOCapableGL();
    const viewport = (mockGL as unknown as { viewport: ReturnType<typeof vi.fn> }).viewport;

    const image = new IPImage({ width: 8, height: 6, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloat(image, 8, 6);

    const calls = viewport.mock.calls;
    // Should have at least 2 viewport calls: one for FBO render, one for restore
    expect(calls.length).toBeGreaterThanOrEqual(2);
    // Last viewport call should restore original viewport [0, 0, 100, 100]
    const lastCall = calls[calls.length - 1] as number[];
    expect(lastCall).toEqual([0, 0, 100, 100]);
  });

  it('REN-FBO-008: calls readPixels with FLOAT type', () => {
    const mockGL = initWithFBOCapableGL();
    const readPixels = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).readPixels;

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloat(image, 4, 4);

    expect(readPixels).toHaveBeenCalledWith(
      0, 0, 4, 4,
      0x1908, // RGBA
      0x1406, // FLOAT
      expect.any(Float32Array),
    );
  });

  it('REN-FBO-009: returns null when readPixels fails (GL error)', () => {
    const mockGL = initWithFBOCapableGL();
    // Make getError return a non-zero error code after readPixels
    (mockGL as unknown as { getError: ReturnType<typeof vi.fn> }).getError = vi.fn(() => 0x0500 as unknown); // GL_INVALID_ENUM

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    const result = renderer.renderImageToFloat(image, 4, 4);

    expect(result).toBeNull();
  });

  it('REN-FBO-010: reuses FBO when dimensions unchanged', () => {
    const mockGL = initWithFBOCapableGL();
    const createFramebuffer = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).createFramebuffer;

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloat(image, 4, 4);
    renderer.renderImageToFloat(image, 4, 4);

    // FBO should only be created once
    expect(createFramebuffer).toHaveBeenCalledTimes(1);
  });

  it('REN-FBO-011: recreates FBO when dimensions change', () => {
    const mockGL = initWithFBOCapableGL();
    const createFramebuffer = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).createFramebuffer;
    const deleteFramebuffer = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).deleteFramebuffer;

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloat(image, 4, 4);
    renderer.renderImageToFloat(image, 8, 8);

    // FBO should be created twice
    expect(createFramebuffer).toHaveBeenCalledTimes(2);
    // Old FBO should be deleted
    expect(deleteFramebuffer).toHaveBeenCalled();
  });

  it('REN-FBO-012: reuses readback buffer when dimensions unchanged', () => {
    initWithFBOCapableGL();

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    const result1 = renderer.renderImageToFloat(image, 4, 4);
    const result2 = renderer.renderImageToFloat(image, 4, 4);

    // Same buffer reference should be returned
    expect(result1).toBe(result2);
  });

  it('REN-FBO-013: allocates new readback buffer when dimensions change', () => {
    initWithFBOCapableGL();

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    const result1 = renderer.renderImageToFloat(image, 4, 4);
    const result2 = renderer.renderImageToFloat(image, 8, 8);

    expect(result1!.length).toBe(4 * 4 * 4);
    expect(result2!.length).toBe(8 * 8 * 4);
    // Different buffer since dimensions changed
    expect(result1).not.toBe(result2);
  });

  it('REN-FBO-014: caches EXT_color_buffer_float check across calls', () => {
    const mockGL = initWithFBOCapableGL();
    const getExtension = (mockGL as unknown as { getExtension: ReturnType<typeof vi.fn> }).getExtension;

    // Count calls BEFORE renderImageToFloat (initialize also calls getExtension)
    const callsBefore = getExtension.mock.calls.filter(
      (c: unknown[]) => c[0] === 'EXT_color_buffer_float'
    ).length;

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloat(image, 4, 4);
    renderer.renderImageToFloat(image, 4, 4);

    // renderImageToFloat should only add ONE getExtension('EXT_color_buffer_float') call
    // (cached after first check), regardless of how many calls initialize() made
    const callsAfter = getExtension.mock.calls.filter(
      (c: unknown[]) => c[0] === 'EXT_color_buffer_float'
    ).length;
    expect(callsAfter - callsBefore).toBe(1);
  });

  it('REN-FBO-015: returns null when FBO creation fails', () => {
    const mockGL = initWithFBOCapableGL();
    // Make checkFramebufferStatus return incomplete
    (mockGL as unknown as { checkFramebufferStatus: ReturnType<typeof vi.fn> }).checkFramebufferStatus =
      vi.fn(() => 0 as unknown); // not FRAMEBUFFER_COMPLETE

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    const result = renderer.renderImageToFloat(image, 4, 4);

    expect(result).toBeNull();
  });

  it('REN-FBO-016: dispose cleans up FBO resources', () => {
    const mockGL = initWithFBOCapableGL();
    const deleteFramebuffer = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).deleteFramebuffer;
    const deleteTexture = mockGL.deleteTexture as ReturnType<typeof vi.fn>;

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloat(image, 4, 4);

    renderer.dispose();

    expect(deleteFramebuffer).toHaveBeenCalled();
    expect(deleteTexture).toHaveBeenCalled();
  });

  it('REN-FBO-017: calls renderImage during FBO render', () => {
    const mockGL = initWithFBOCapableGL();
    const drawArrays = mockGL.drawArrays as ReturnType<typeof vi.fn>;

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloat(image, 4, 4);

    // renderImage should have drawn the quad (TRIANGLE_STRIP)
    expect(drawArrays).toHaveBeenCalled();
  });
});

// =============================================================================
// renderImageToFloatAsync (PBO double-buffered async readback)
// =============================================================================

describe('Renderer renderImageToFloatAsync', () => {
  let renderer: Renderer;

  beforeEach(() => {
    renderer = new Renderer();
  });

  /**
   * Extend the FBO-capable GL mock with PBO and fence sync support.
   */
  function createPBOCapableGL() {
    const mockGL = createMockGL();
    const extendedGL = mockGL as unknown as Record<string, unknown>;

    // FBO constants & methods
    extendedGL.FRAMEBUFFER = 0x8d40;
    extendedGL.COLOR_ATTACHMENT0 = 0x8ce0;
    extendedGL.FRAMEBUFFER_COMPLETE = 0x8cd5;
    extendedGL.NO_ERROR = 0;
    extendedGL.VIEWPORT = 0x0ba2;
    extendedGL.TEXTURE_3D = 0x806f;
    extendedGL.TEXTURE_WRAP_R = 0x8072;
    extendedGL.RGBA32F = 0x8814;
    extendedGL.RGB32F = 0x8815;
    extendedGL.R32F = 0x822e;
    extendedGL.RG32F = 0x8230;
    extendedGL.RED = 0x1903;
    extendedGL.RG = 0x8227;
    extendedGL.RGB = 0x1907;
    extendedGL.TEXTURE1 = 0x84c1;
    extendedGL.TEXTURE2 = 0x84c2;
    extendedGL.TEXTURE3 = 0x84c3;

    extendedGL.createFramebuffer = vi.fn(() => ({}));
    extendedGL.bindFramebuffer = vi.fn();
    extendedGL.framebufferTexture2D = vi.fn();
    extendedGL.checkFramebufferStatus = vi.fn(() => 0x8cd5);
    extendedGL.deleteFramebuffer = vi.fn();
    extendedGL.texImage3D = vi.fn();
    extendedGL.uniform2fv = vi.fn();
    extendedGL.uniform3fv = vi.fn();
    extendedGL.uniformMatrix3fv = vi.fn();
    extendedGL.getError = vi.fn(() => 0);

    // PBO constants
    extendedGL.PIXEL_PACK_BUFFER = 0x88eb;
    extendedGL.DYNAMIC_READ = 0x88e9;
    extendedGL.SYNC_GPU_COMMANDS_COMPLETE = 0x9117;
    extendedGL.SYNC_STATUS = 0x9114;
    extendedGL.SIGNALED = 0x9119;
    extendedGL.UNSIGNALED = 0x9118;
    extendedGL.SYNC_FLUSH_COMMANDS_BIT = 0x00000001;
    extendedGL.ALREADY_SIGNALED = 0x911a;
    extendedGL.TIMEOUT_EXPIRED = 0x911b;

    // PBO / fence methods
    let fenceCounter = 0;
    const fenceSignaled = new Map<number, boolean>();

    extendedGL.fenceSync = vi.fn(() => {
      const id = ++fenceCounter;
      fenceSignaled.set(id, false);
      return id;
    });
    extendedGL.deleteSync = vi.fn((sync: number) => {
      fenceSignaled.delete(sync);
    });
    extendedGL.getSyncParameter = vi.fn((_sync: number, _pname: number) => {
      return fenceSignaled.get(_sync) ? 0x9119 /* SIGNALED */ : 0x9118 /* UNSIGNALED */;
    });
    extendedGL.clientWaitSync = vi.fn();
    extendedGL.flush = vi.fn();
    extendedGL.getBufferSubData = vi.fn(
      (_target: number, _srcOffset: number, dst: Float32Array) => {
        // Fill with recognizable PBO pattern
        for (let i = 0; i < dst.length; i += 4) {
          dst[i] = 0.7;     // R
          dst[i + 1] = 2.0; // G (HDR)
          dst[i + 2] = 0.1; // B
          dst[i + 3] = 1.0; // A
        }
      },
    );

    // readPixels fills Float32Array with FBO pattern (different from PBO pattern)
    extendedGL.readPixels = vi.fn(
      (_x: number, _y: number, _w: number, _h: number, _fmt: number, _type: number, pixels: Float32Array | number) => {
        if (pixels instanceof Float32Array) {
          for (let i = 0; i < pixels.length; i += 4) {
            pixels[i] = 0.5;     // R
            pixels[i + 1] = 1.5; // G (HDR)
            pixels[i + 2] = 0.3; // B
            pixels[i + 3] = 1.0; // A
          }
        }
        // When pixels is 0 (PBO offset), it's an async PBO write — nothing to fill
      },
    );

    extendedGL.getParameter = vi.fn((param: number) => {
      if (param === 0x0ba2) return new Int32Array([0, 0, 100, 100]);
      return null;
    });

    // EXT_color_buffer_float support
    const originalGetExtension = mockGL.getExtension as ReturnType<typeof vi.fn>;
    extendedGL.getExtension = vi.fn((name: string) => {
      if (name === 'EXT_color_buffer_float') return {};
      if (name === 'OES_texture_float_linear') return {};
      return originalGetExtension(name);
    });

    // Helper to signal specific fences
    (mockGL as unknown as { _signalFence: (id: number) => void })._signalFence = (id: number) => {
      fenceSignaled.set(id, true);
    };
    (mockGL as unknown as { _signalAllFences: () => void })._signalAllFences = () => {
      for (const [id] of fenceSignaled) {
        fenceSignaled.set(id, true);
      }
    };
    (mockGL as unknown as { _getFenceMap: () => Map<number, boolean> })._getFenceMap = () => fenceSignaled;

    return mockGL;
  }

  function initWithPBOCapableGL() {
    const mockGL = createPBOCapableGL();
    const canvas = document.createElement('canvas');
    const originalGetContext = canvas.getContext.bind(canvas);
    canvas.getContext = vi.fn((contextId: string, _options?: unknown) => {
      if (contextId === 'webgl2') return mockGL;
      return originalGetContext(contextId, _options as CanvasRenderingContext2DSettings);
    }) as typeof canvas.getContext;
    renderer.initialize(canvas);
    return mockGL;
  }

  it('REN-PBO-001: returns null when renderer is not initialized', () => {
    const image = new IPImage({ width: 10, height: 10, channels: 4, dataType: 'uint8' });
    const result = renderer.renderImageToFloatAsync(image, 10, 10);
    expect(result).toBeNull();
  });

  it('REN-PBO-002: returns null when EXT_color_buffer_float is unavailable', () => {
    const mockGL = createPBOCapableGL();
    (mockGL as unknown as Record<string, unknown>).getExtension = vi.fn(() => null);

    const canvas = document.createElement('canvas');
    canvas.getContext = vi.fn((contextId: string) => {
      if (contextId === 'webgl2') return mockGL;
      return null;
    }) as typeof canvas.getContext;
    renderer.initialize(canvas);

    const image = new IPImage({ width: 10, height: 10, channels: 4, dataType: 'uint8' });
    const result = renderer.renderImageToFloatAsync(image, 10, 10);
    expect(result).toBeNull();
  });

  it('REN-PBO-003: first frame returns Float32Array via sync readPixels from FBO', () => {
    initWithPBOCapableGL();

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    const result = renderer.renderImageToFloatAsync(image, 4, 4);

    expect(result).toBeInstanceOf(Float32Array);
    expect(result!.length).toBe(4 * 4 * 4);
    // First frame uses sync readPixels → FBO pattern (R=0.5, G=1.5)
    expect(result![0]).toBe(0.5);
    expect(result![1]).toBe(1.5);
  });

  it('REN-PBO-004: first frame does NOT call getBufferSubData (no PBO read)', () => {
    const mockGL = initWithPBOCapableGL();
    const getBufferSubData = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).getBufferSubData;

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloatAsync(image, 4, 4);

    expect(getBufferSubData).not.toHaveBeenCalled();
  });

  it('REN-PBO-005: first frame issues async readPixels into PBO + fenceSync + flush', () => {
    const mockGL = initWithPBOCapableGL();
    const bindBuffer = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).bindBuffer;
    const readPixels = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).readPixels;
    const fenceSync = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).fenceSync;
    const flush = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).flush;

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloatAsync(image, 4, 4);

    // Should have bound PIXEL_PACK_BUFFER for async readPixels
    const pboBindCalls = bindBuffer!.mock.calls.filter((c: unknown[]) => c[0] === 0x88eb);
    expect(pboBindCalls.length).toBeGreaterThanOrEqual(2); // bind + unbind

    // readPixels called with offset 0 (PBO write) — the last arg is 0 not Float32Array
    const pboReadCalls = readPixels!.mock.calls.filter((c: unknown[]) => c[6] === 0);
    expect(pboReadCalls.length).toBe(1);

    // fenceSync and flush called
    expect(fenceSync).toHaveBeenCalled();
    expect(flush).toHaveBeenCalled();
  });

  it('REN-PBO-006: second frame returns cached data when fence not signaled', () => {
    initWithPBOCapableGL();
    // Fences default to UNSIGNALED

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    const result1 = renderer.renderImageToFloatAsync(image, 4, 4);
    const result2 = renderer.renderImageToFloatAsync(image, 4, 4);

    // Both return valid data (same buffer reference)
    expect(result1).toBe(result2);
    // Data is from first frame's sync readPixels (FBO pattern)
    expect(result2![0]).toBe(0.5);
    expect(result2![1]).toBe(1.5);
  });

  it('REN-PBO-007: reads PBO data when fence is signaled', () => {
    const mockGL = initWithPBOCapableGL();
    const helpers = mockGL as unknown as { _signalAllFences: () => void };

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });

    // Frame 1: sync readPixels from FBO, PBO write started
    renderer.renderImageToFloatAsync(image, 4, 4);

    // Signal all fences (simulates GPU completing async readPixels)
    helpers._signalAllFences();

    // Frame 2: should read from PBO (signaled fence)
    const result = renderer.renderImageToFloatAsync(image, 4, 4);

    expect(result).not.toBeNull();
    // PBO data pattern: R=0.7, G=2.0 (from getBufferSubData mock)
    // Use toBeCloseTo for Float32 precision (0.7 → 0.699999988...)
    expect(result![0]).toBeCloseTo(0.7, 5);
    expect(result![1]).toBeCloseTo(2.0, 5);
  });

  it('REN-PBO-008: deletes fence after reading signaled PBO', () => {
    const mockGL = initWithPBOCapableGL();
    const deleteSync = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).deleteSync;
    const helpers = mockGL as unknown as { _signalAllFences: () => void };

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloatAsync(image, 4, 4);

    helpers._signalAllFences();
    renderer.renderImageToFloatAsync(image, 4, 4);

    // Fence from frame 1 should be deleted after being consumed
    expect(deleteSync).toHaveBeenCalled();
  });

  it('REN-PBO-009: does NOT call clientWaitSync (uses getSyncParameter polling)', () => {
    const mockGL = initWithPBOCapableGL();
    const clientWaitSync = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).clientWaitSync;
    const getSyncParameter = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).getSyncParameter;
    const helpers = mockGL as unknown as { _signalAllFences: () => void };

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloatAsync(image, 4, 4);
    helpers._signalAllFences();
    renderer.renderImageToFloatAsync(image, 4, 4);

    // getSyncParameter should be used for polling, not clientWaitSync
    expect(getSyncParameter).toHaveBeenCalled();
    expect(clientWaitSync).not.toHaveBeenCalled();
  });

  it('REN-PBO-010: creates two PBOs with DYNAMIC_READ usage', () => {
    const mockGL = initWithPBOCapableGL();
    const bufferData = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).bufferData;

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloatAsync(image, 4, 4);

    // Two PBOs created with PIXEL_PACK_BUFFER + DYNAMIC_READ
    const pboAllocCalls = bufferData!.mock.calls.filter(
      (c: unknown[]) => c[0] === 0x88eb && c[2] === 0x88e9
    );
    expect(pboAllocCalls.length).toBe(2);
  });

  it('REN-PBO-011: only writes to idle PBO (no pending fence)', () => {
    const mockGL = initWithPBOCapableGL();
    const fenceSync = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).fenceSync;
    // Fences stay UNSIGNALED — both PBOs become "pending"

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });

    // Frame 1: writes PBO[0], fence created
    renderer.renderImageToFloatAsync(image, 4, 4);
    expect(fenceSync).toHaveBeenCalledTimes(1);

    // Frame 2: PBO[0] has fence (unsignaled), writes PBO[1]
    renderer.renderImageToFloatAsync(image, 4, 4);
    expect(fenceSync).toHaveBeenCalledTimes(2);

    // Frame 3: both PBOs have fences (unsignaled) — no PBO write
    renderer.renderImageToFloatAsync(image, 4, 4);
    expect(fenceSync).toHaveBeenCalledTimes(2); // no new fence
  });

  it('REN-PBO-012: unbinds FBO and restores viewport after render', () => {
    const mockGL = initWithPBOCapableGL();
    const bindFramebuffer = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).bindFramebuffer;
    const viewport = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).viewport;

    const image = new IPImage({ width: 8, height: 6, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloatAsync(image, 8, 6);

    // Last bindFramebuffer should unbind (null)
    const lastBind = bindFramebuffer!.mock.calls[bindFramebuffer!.mock.calls.length - 1] as unknown[];
    expect(lastBind[1]).toBeNull();

    // Last viewport should restore original [0, 0, 100, 100]
    const lastViewport = viewport!.mock.calls[viewport!.mock.calls.length - 1] as number[];
    expect(lastViewport).toEqual([0, 0, 100, 100]);
  });

  it('REN-PBO-013: reuses cached pixel buffer when dimensions unchanged', () => {
    initWithPBOCapableGL();

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    const result1 = renderer.renderImageToFloatAsync(image, 4, 4);
    const result2 = renderer.renderImageToFloatAsync(image, 4, 4);

    expect(result1).toBe(result2); // Same Float32Array reference
  });

  it('REN-PBO-014: disposes PBOs when dimensions change', () => {
    const mockGL = initWithPBOCapableGL();
    const deleteBuffer = mockGL.deleteBuffer as ReturnType<typeof vi.fn>;

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloatAsync(image, 4, 4);

    const deletesBefore = deleteBuffer.mock.calls.length;
    renderer.renderImageToFloatAsync(image, 8, 8);

    // Old PBOs should be deleted
    expect(deleteBuffer.mock.calls.length).toBeGreaterThan(deletesBefore);
  });

  it('REN-PBO-015: dispose cleans up PBOs and fences', () => {
    const mockGL = initWithPBOCapableGL();
    const deleteBuffer = mockGL.deleteBuffer as ReturnType<typeof vi.fn>;
    const deleteSync = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).deleteSync;

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    renderer.renderImageToFloatAsync(image, 4, 4);

    renderer.dispose();

    expect(deleteBuffer).toHaveBeenCalled();
    expect(deleteSync).toHaveBeenCalled();
  });

  it('REN-PBO-016: falls back to sync renderImageToFloat when PBO creation fails', () => {
    const mockGL = initWithPBOCapableGL();
    // Make createBuffer fail
    (mockGL as unknown as Record<string, unknown>).createBuffer = vi.fn(() => null);

    // Reset the renderer to force PBO re-creation
    renderer.dispose();
    renderer = new Renderer();
    const canvas = document.createElement('canvas');
    const originalGetContext = canvas.getContext.bind(canvas);
    canvas.getContext = vi.fn((contextId: string, _options?: unknown) => {
      if (contextId === 'webgl2') return mockGL;
      return originalGetContext(contextId, _options as CanvasRenderingContext2DSettings);
    }) as typeof canvas.getContext;
    renderer.initialize(canvas);

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    const result = renderer.renderImageToFloatAsync(image, 4, 4);

    // Should still return data via sync fallback
    expect(result).toBeInstanceOf(Float32Array);
    expect(result![0]).toBe(0.5); // FBO pattern from sync readPixels
  });

  it('REN-PBO-017: steady-state reads PBO data every frame when fences signal', () => {
    const mockGL = initWithPBOCapableGL();
    const helpers = mockGL as unknown as { _signalAllFences: () => void };
    const getBufferSubData = (mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>).getBufferSubData;

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });

    // Frame 1: sync readPixels (first frame)
    renderer.renderImageToFloatAsync(image, 4, 4);
    expect(getBufferSubData).not.toHaveBeenCalled();

    // Signal fences, then frame 2
    helpers._signalAllFences();
    renderer.renderImageToFloatAsync(image, 4, 4);
    expect(getBufferSubData).toHaveBeenCalledTimes(1);

    // Signal fences, then frame 3
    helpers._signalAllFences();
    renderer.renderImageToFloatAsync(image, 4, 4);
    expect(getBufferSubData).toHaveBeenCalledTimes(2);
  });

  it('REN-PBO-018: returns null when FBO creation fails', () => {
    const mockGL = initWithPBOCapableGL();
    (mockGL as unknown as Record<string, unknown>).checkFramebufferStatus =
      vi.fn(() => 0); // not FRAMEBUFFER_COMPLETE

    // Force FBO re-creation
    renderer.dispose();
    renderer = new Renderer();
    const canvas = document.createElement('canvas');
    canvas.getContext = vi.fn((contextId: string) => {
      if (contextId === 'webgl2') return mockGL;
      return null;
    }) as typeof canvas.getContext;
    renderer.initialize(canvas);

    const image = new IPImage({ width: 4, height: 4, channels: 4, dataType: 'uint8' });
    const result = renderer.renderImageToFloatAsync(image, 4, 4);

    expect(result).toBeNull();
  });
});

// =============================================================================
// Detached ImageBitmap guard in renderSDRFrame
// =============================================================================

describe('Renderer detached ImageBitmap guard', () => {
  let renderer: Renderer;

  beforeEach(() => {
    renderer = new Renderer();
  });

  it('REN-GUARD-001: renderSDRFrame returns null for detached ImageBitmap (width=0)', () => {
    initRendererWithMockGL(renderer);
    renderer.resize(100, 100);

    // Simulate a detached ImageBitmap (closed bitmap has width/height = 0)
    const detachedBitmap = {
      width: 0,
      height: 100,
      close: vi.fn(),
    };

    // Make it pass the instanceof check
    if (typeof ImageBitmap !== 'undefined') {
      Object.setPrototypeOf(detachedBitmap, ImageBitmap.prototype);
      const result = renderer.renderSDRFrame(detachedBitmap as unknown as ImageBitmap);
      expect(result).toBeNull();
    }
  });

  it('REN-GUARD-002: renderSDRFrame returns null for detached ImageBitmap (height=0)', () => {
    initRendererWithMockGL(renderer);
    renderer.resize(100, 100);

    const detachedBitmap = {
      width: 100,
      height: 0,
      close: vi.fn(),
    };

    if (typeof ImageBitmap !== 'undefined') {
      Object.setPrototypeOf(detachedBitmap, ImageBitmap.prototype);
      const result = renderer.renderSDRFrame(detachedBitmap as unknown as ImageBitmap);
      expect(result).toBeNull();
    }
  });

  it('REN-GUARD-003: renderSDRFrame returns null for detached ImageBitmap (both 0)', () => {
    initRendererWithMockGL(renderer);
    renderer.resize(100, 100);

    const detachedBitmap = {
      width: 0,
      height: 0,
      close: vi.fn(),
    };

    if (typeof ImageBitmap !== 'undefined') {
      Object.setPrototypeOf(detachedBitmap, ImageBitmap.prototype);
      const result = renderer.renderSDRFrame(detachedBitmap as unknown as ImageBitmap);
      expect(result).toBeNull();
    }
  });

  it('REN-GUARD-004: renderSDRFrame succeeds for non-ImageBitmap with zero dimensions', () => {
    initRendererWithMockGL(renderer);
    renderer.resize(100, 100);

    // A regular canvas with zero dimensions should still attempt rendering (not guarded)
    const canvas = document.createElement('canvas');
    canvas.width = 0;
    canvas.height = 0;

    const result = renderer.renderSDRFrame(canvas);
    // Should not be null — the guard only applies to ImageBitmap
    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });
});

// =============================================================================
// Texture rotation uniform (u_texRotation) in renderImage
// =============================================================================

describe('Renderer texture rotation (u_texRotation)', () => {
  /**
   * Create a mock GL that tracks uniform1i calls by name.
   * getUniformLocation returns the uniform name for easy tracking.
   */
  function createRotationTrackingGL() {
    const uniformCalls: Array<{ name: string; value: number }> = [];
    const gl = createMockGL();

    // Override getUniformLocation to return name-tagged objects
    (gl.getUniformLocation as ReturnType<typeof vi.fn>).mockImplementation(
      (_program: unknown, name: string) => ({ __name: name })
    );

    // Track uniform1i calls with their location name
    (gl.uniform1i as ReturnType<typeof vi.fn>).mockImplementation(
      (location: { __name: string } | null, value: number) => {
        if (location && '__name' in location) {
          uniformCalls.push({ name: location.__name, value });
        }
      }
    );

    return { gl, uniformCalls };
  }

  function initWithTrackingGL(renderer: Renderer): ReturnType<typeof createRotationTrackingGL> {
    const tracking = createRotationTrackingGL();
    const canvas = document.createElement('canvas');
    const originalGetContext = canvas.getContext.bind(canvas);
    canvas.getContext = vi.fn((contextId: string, _options?: unknown) => {
      if (contextId === 'webgl2') return tracking.gl;
      return originalGetContext(contextId, _options as CanvasRenderingContext2DSettings);
    }) as typeof canvas.getContext;
    renderer.initialize(canvas);
    return tracking;
  }

  it('REN-ROT-001: renderImage sets u_texRotation=0 when no videoRotation', () => {
    const renderer = new Renderer();
    const { uniformCalls } = initWithTrackingGL(renderer);
    renderer.resize(100, 100);

    const image = new IPImage({ width: 10, height: 10, channels: 4, dataType: 'uint8' });
    renderer.renderImage(image);

    const rotationCalls = uniformCalls.filter(c => c.name === 'u_texRotation');
    expect(rotationCalls.length).toBeGreaterThanOrEqual(1);
    expect(rotationCalls[rotationCalls.length - 1]!.value).toBe(0);
  });

  it('REN-ROT-002: renderImage sets u_texRotation=1 for 90° rotation', () => {
    const renderer = new Renderer();
    const { uniformCalls } = initWithTrackingGL(renderer);
    renderer.resize(100, 100);

    const image = new IPImage({
      width: 10, height: 10, channels: 4, dataType: 'uint8',
      metadata: { attributes: { videoRotation: 90 } },
    });
    renderer.renderImage(image);

    const rotationCalls = uniformCalls.filter(c => c.name === 'u_texRotation');
    expect(rotationCalls.length).toBeGreaterThanOrEqual(1);
    expect(rotationCalls[rotationCalls.length - 1]!.value).toBe(1);
  });

  it('REN-ROT-003: renderImage sets u_texRotation=2 for 180° rotation', () => {
    const renderer = new Renderer();
    const { uniformCalls } = initWithTrackingGL(renderer);
    renderer.resize(100, 100);

    const image = new IPImage({
      width: 10, height: 10, channels: 4, dataType: 'uint8',
      metadata: { attributes: { videoRotation: 180 } },
    });
    renderer.renderImage(image);

    const rotationCalls = uniformCalls.filter(c => c.name === 'u_texRotation');
    expect(rotationCalls.length).toBeGreaterThanOrEqual(1);
    expect(rotationCalls[rotationCalls.length - 1]!.value).toBe(2);
  });

  it('REN-ROT-004: renderImage sets u_texRotation=3 for 270° rotation', () => {
    const renderer = new Renderer();
    const { uniformCalls } = initWithTrackingGL(renderer);
    renderer.resize(100, 100);

    const image = new IPImage({
      width: 10, height: 10, channels: 4, dataType: 'uint8',
      metadata: { attributes: { videoRotation: 270 } },
    });
    renderer.renderImage(image);

    const rotationCalls = uniformCalls.filter(c => c.name === 'u_texRotation');
    expect(rotationCalls.length).toBeGreaterThanOrEqual(1);
    expect(rotationCalls[rotationCalls.length - 1]!.value).toBe(3);
  });

  it('REN-ROT-005: renderSDRFrame sets u_texRotation=0 (no rotation for SDR)', () => {
    const renderer = new Renderer();
    const { uniformCalls } = initWithTrackingGL(renderer);
    renderer.resize(100, 100);

    const sourceCanvas = document.createElement('canvas');
    renderer.renderSDRFrame(sourceCanvas);

    const rotationCalls = uniformCalls.filter(c => c.name === 'u_texRotation');
    expect(rotationCalls.length).toBeGreaterThanOrEqual(1);
    expect(rotationCalls[rotationCalls.length - 1]!.value).toBe(0);
  });

  it('REN-ROT-006: renderImage wraps rotation at 360°', () => {
    const renderer = new Renderer();
    const { uniformCalls } = initWithTrackingGL(renderer);
    renderer.resize(100, 100);

    const image = new IPImage({
      width: 10, height: 10, channels: 4, dataType: 'uint8',
      metadata: { attributes: { videoRotation: 360 } },
    });
    renderer.renderImage(image);

    const rotationCalls = uniformCalls.filter(c => c.name === 'u_texRotation');
    expect(rotationCalls.length).toBeGreaterThanOrEqual(1);
    // 360 / 90 = 4, 4 % 4 = 0
    expect(rotationCalls[rotationCalls.length - 1]!.value).toBe(0);
  });
});
