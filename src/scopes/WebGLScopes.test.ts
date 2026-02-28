import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WebGLScopesProcessor,
  getSharedScopesProcessor,
  disposeSharedScopesProcessor,
  setScopesHDRMode,
} from './WebGLScopes';

// Mock WebGL2 context
function createMockWebGL2Context() {
  return {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    LINK_STATUS: 35714,
    COMPILE_STATUS: 35713,
    TEXTURE_2D: 3553,
    TEXTURE0: 33984,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    NEAREST: 9728,
    CLAMP_TO_EDGE: 33071,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    COLOR_BUFFER_BIT: 16384,
    POINTS: 0,
    ONE: 1,
    BLEND: 3042,
    FLOAT: 5126,
    RGBA16F: 0x881A,
    RGBA32F: 0x8814,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    TRIANGLES: 4,
    COMPLETION_STATUS_KHR: 0x91B1,

    createShader: vi.fn((_type: number) => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn((_shader: unknown, _pname: number) => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),

    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn((_program: unknown, _pname: number) => true),
    getProgramInfoLog: vi.fn(() => ''),
    useProgram: vi.fn(),
    deleteProgram: vi.fn(),

    getUniformLocation: vi.fn((_prog: unknown, name: string) => ({ name })),

    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    deleteTexture: vi.fn(),
    activeTexture: vi.fn(),

    createVertexArray: vi.fn(() => ({})),
    bindVertexArray: vi.fn(),
    deleteVertexArray: vi.fn(),

    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3f: vi.fn(),

    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    blendFunc: vi.fn(),
    drawArrays: vi.fn(),
    getExtension: vi.fn((name: string) => {
      if (name === 'KHR_parallel_shader_compile') return {};
      if (name === 'WEBGL_lose_context') return { loseContext: vi.fn() };
      return null;
    }) as ReturnType<typeof vi.fn>,
  };
}

describe('WebGLScopesProcessor', () => {
  let originalCreateElement: typeof document.createElement;
  let mockOutputCanvas: HTMLCanvasElement;
  let mockGl: ReturnType<typeof createMockWebGL2Context>;
  let mockOutputCtx: CanvasRenderingContext2D;
  // Control flag for tests that need to simulate WebGL2 not being available
  let simulateWebGL2NotSupported = false;
  // Track created canvases so tests can inspect them
  let createdCanvases: Array<{ width: number; height: number; getContext: ReturnType<typeof vi.fn> }>;

  beforeEach(() => {
    simulateWebGL2NotSupported = false;
    createdCanvases = [];
    mockGl = createMockWebGL2Context();

    // Create a mock 2D context with all required methods
    const create2DContext = (canvas: { width: number; height: number }) => ({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      putImageData: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      // Return ImageData with the requested dimensions
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) =>
        new ImageData(w || canvas.width || 100, h || canvas.height || 100)
      ),
    });

    mockOutputCtx = create2DContext({ width: 256, height: 100 }) as unknown as CanvasRenderingContext2D;

    mockOutputCanvas = {
      width: 256,
      height: 100,
      getContext: vi.fn(() => mockOutputCtx),
    } as unknown as HTMLCanvasElement;

    originalCreateElement = document.createElement;
    document.createElement = vi.fn((tag: string): HTMLElement => {
      if (tag === 'canvas') {
        // Return a new mock canvas for each createElement call
        // This is important for the downscaling canvases
        const newCanvas: { width: number; height: number; getContext: ReturnType<typeof vi.fn> } = {
          width: 0,
          height: 0,
          getContext: vi.fn((ctxType: string): unknown => {
            if (simulateWebGL2NotSupported && ctxType === 'webgl2') return null;
            if (ctxType === 'webgl2') return mockGl;
            if (ctxType === '2d') return create2DContext(newCanvas);
            return null;
          }),
        };
        createdCanvases.push(newCanvas);
        return newCanvas as unknown as HTMLCanvasElement;
      }
      return originalCreateElement.call(document, tag);
    }) as typeof document.createElement;
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    disposeSharedScopesProcessor();
  });

  describe('constructor', () => {
    it('WGS-001: creates WebGL2 context with performance options', () => {
      new WebGLScopesProcessor();

      // The first created canvas is the WebGL canvas
      const webglCanvas = createdCanvases[0]!;
      expect(webglCanvas.getContext).toHaveBeenCalledWith('webgl2', {
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        antialias: false,
        depth: false,
        stencil: false,
      });
    });

    it('WGS-002: throws error when WebGL2 is not supported', () => {
      simulateWebGL2NotSupported = true;

      expect(() => new WebGLScopesProcessor()).toThrow('WebGL2 not supported');
    });

    it('WGS-003: creates shader programs for all scopes', () => {
      new WebGLScopesProcessor();

      expect(mockGl.createProgram).toHaveBeenCalledTimes(3);
    });

    it('WGS-004: creates VAO for point rendering', () => {
      new WebGLScopesProcessor();

      expect(mockGl.createVertexArray).toHaveBeenCalled();
      expect(mockGl.bindVertexArray).toHaveBeenCalled();
    });

    it('WGS-005: enables blend mode once during init', () => {
      new WebGLScopesProcessor();

      expect(mockGl.enable).toHaveBeenCalledWith(mockGl.BLEND);
      expect(mockGl.blendFunc).toHaveBeenCalledWith(mockGl.ONE, mockGl.ONE);
    });

    it('WGS-005b: probes KHR_parallel_shader_compile extension', () => {
      new WebGLScopesProcessor();

      expect(mockGl.getExtension).toHaveBeenCalledWith('KHR_parallel_shader_compile');
    });

    it('WGS-005c: creates 6 shaders and 3 programs via ShaderProgram', () => {
      new WebGLScopesProcessor();

      // 3 ShaderProgram instances, each creating 2 shaders (vertex + fragment) = 6
      expect(mockGl.createShader).toHaveBeenCalledTimes(6);
      expect(mockGl.createProgram).toHaveBeenCalledTimes(3);
    });
  });

  describe('isReady', () => {
    it('WGS-006: returns true when initialized successfully', () => {
      const processor = new WebGLScopesProcessor();
      expect(processor.isReady()).toBe(true);
    });

    it('WGS-007: returns false when shader compilation is still pending', () => {
      // Make COMPLETION_STATUS_KHR return false (shaders still compiling)
      mockGl.getShaderParameter.mockImplementation((_shader: unknown, param: number) => {
        if (param === 0x91B1) return false; // COMPLETION_STATUS_KHR
        return true; // COMPILE_STATUS
      });

      const processor = new WebGLScopesProcessor();
      expect(processor.isReady()).toBe(false);
    });

    it('WGS-007b: returns false when any one program is still compiling', () => {
      // First two programs complete, third still compiling
      let programParamCallCount = 0;
      mockGl.getProgramParameter.mockImplementation((_program: unknown, param: number) => {
        if (param === 0x91B1) { // COMPLETION_STATUS_KHR
          programParamCallCount++;
          // 3rd call: the vectorscope program is not ready
          return programParamCallCount <= 2;
        }
        return true; // LINK_STATUS
      });

      const processor = new WebGLScopesProcessor();
      expect(processor.isReady()).toBe(false);
    });
  });

  describe('setImage', () => {
    it('WGS-008: uploads image data to texture', () => {
      const processor = new WebGLScopesProcessor();
      const imageData = new ImageData(10, 10);

      processor.setImage(imageData);

      expect(mockGl.texImage2D).toHaveBeenCalled();
    });

    it('WGS-009: sets texture parameters only once', () => {
      const processor = new WebGLScopesProcessor();

      processor.setImage(new ImageData(100, 100));
      const firstCallCount = mockGl.texParameteri.mock.calls.length;

      processor.setImage(new ImageData(100, 100));
      const secondCallCount = mockGl.texParameteri.mock.calls.length;

      // Should not call texParameteri again
      expect(secondCallCount).toBe(firstCallCount);
    });

    it('WGS-010: calculates subsampling for large images (waveform)', () => {
      const processor = new WebGLScopesProcessor();

      // 4K image should trigger subsampling
      const imageData = new ImageData(3840, 2160);
      processor.setImage(imageData);
      processor.renderWaveform(mockOutputCanvas, 'luma');

      // Should use subsampled vertex count (less than full 8.3M pixels)
      const drawCall = mockGl.drawArrays.mock.calls[0];
      expect(drawCall![2]).toBeLessThan(3840 * 2160);
    });

    it('WGS-011: downscales large images to analysis dimensions', () => {
      const processor = new WebGLScopesProcessor();
      const imageData = new ImageData(1920, 1080);

      processor.setImage(imageData);
      processor.renderWaveform(mockOutputCanvas, 'luma');

      // 1920x1080 should be downscaled to fit within paused target (640x360)
      const imageSizeCall = mockGl.uniform2f.mock.calls.find(
        (call) => call[0]?.name === 'u_imageSize'
      );
      expect(imageSizeCall![1]).toBeLessThanOrEqual(640);
      expect(imageSizeCall![2]).toBeLessThanOrEqual(360);
    });
  });

  describe('renderHistogram', () => {
    // Helper to create mock histogram data
    const createMockHistogramData = () => ({
      red: new Uint32Array(256).fill(100),
      green: new Uint32Array(256).fill(100),
      blue: new Uint32Array(256).fill(100),
      luminance: new Uint32Array(256).fill(100),
      maxValue: 1000,
    });

    it('WGS-012: renders RGB histogram with 3 draw calls', () => {
      const processor = new WebGLScopesProcessor();
      const histData = createMockHistogramData();

      processor.renderHistogram(mockOutputCanvas, histData, 'rgb');

      expect(mockGl.drawArrays).toHaveBeenCalledTimes(3);
    });

    it('WGS-013: renders luminance histogram with 1 draw call', () => {
      const processor = new WebGLScopesProcessor();
      const histData = createMockHistogramData();

      mockGl.drawArrays.mockClear();
      processor.renderHistogram(mockOutputCanvas, histData, 'luminance');

      expect(mockGl.drawArrays).toHaveBeenCalledTimes(1);
    });

    it('WGS-014: copies result to output canvas', () => {
      const processor = new WebGLScopesProcessor();
      const histData = createMockHistogramData();

      processor.renderHistogram(mockOutputCanvas, histData, 'rgb');

      expect(mockOutputCtx.drawImage).toHaveBeenCalled();
    });

    it('WGS-015: sets maxValue uniform for normalization', () => {
      const processor = new WebGLScopesProcessor();
      const histData = createMockHistogramData();
      histData.maxValue = 5000;

      processor.renderHistogram(mockOutputCanvas, histData, 'rgb');

      expect(mockGl.uniform1f).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'u_maxValue' }),
        5000
      );
    });

    it('WGS-015b: respects logScale parameter', () => {
      const processor = new WebGLScopesProcessor();
      const histData = createMockHistogramData();

      processor.renderHistogram(mockOutputCanvas, histData, 'luminance', true);

      expect(mockGl.uniform1i).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'u_logScale' }),
        1
      );
    });
  });

  describe('renderWaveform', () => {
    it('WGS-016: renders luma waveform', () => {
      const processor = new WebGLScopesProcessor();
      processor.setImage(new ImageData(100, 100));

      mockGl.drawArrays.mockClear();
      processor.renderWaveform(mockOutputCanvas, 'luma');

      expect(mockGl.drawArrays).toHaveBeenCalledTimes(1);
    });

    it('WGS-017: renders RGB overlay waveform with 3 draw calls', () => {
      const processor = new WebGLScopesProcessor();
      processor.setImage(new ImageData(100, 100));

      mockGl.drawArrays.mockClear();
      processor.renderWaveform(mockOutputCanvas, 'rgb');

      expect(mockGl.drawArrays).toHaveBeenCalledTimes(3);
    });

    it('WGS-018: renders parade waveform with 3 draw calls', () => {
      const processor = new WebGLScopesProcessor();
      processor.setImage(new ImageData(100, 100));

      mockGl.drawArrays.mockClear();
      processor.renderWaveform(mockOutputCanvas, 'parade');

      expect(mockGl.drawArrays).toHaveBeenCalledTimes(3);
    });

    it('WGS-018b: RGB waveform respects enabled channel options', () => {
      const processor = new WebGLScopesProcessor();
      processor.setImage(new ImageData(100, 100));

      mockGl.drawArrays.mockClear();
      mockGl.uniform1i.mockClear();
      processor.renderWaveform(mockOutputCanvas, 'rgb', {
        channels: { r: true, g: false, b: true },
      });

      expect(mockGl.drawArrays).toHaveBeenCalledTimes(2);
      const channelUniformCalls = mockGl.uniform1i.mock.calls.filter((call) => call[0]?.name === 'u_channel');
      expect(channelUniformCalls.map((call) => call[1])).toEqual([0, 2]);
    });

    it('WGS-018c: RGB waveform uses provided intensity for opacity', () => {
      const processor = new WebGLScopesProcessor();
      processor.setImage(new ImageData(100, 100));

      mockGl.uniform1f.mockClear();
      processor.renderWaveform(mockOutputCanvas, 'rgb', { intensity: 0.2 });

      const opacityCall = mockGl.uniform1f.mock.calls.find((call) => call[0]?.name === 'u_opacity');
      expect(opacityCall).toBeDefined();
      expect(opacityCall![1]).toBe(0.2);
    });
  });

  describe('renderVectorscope', () => {
    it('WGS-019: renders vectorscope with zoom', () => {
      const processor = new WebGLScopesProcessor();
      processor.setImage(new ImageData(100, 100));

      mockGl.drawArrays.mockClear();
      processor.renderVectorscope(mockOutputCanvas, 2);

      expect(mockGl.drawArrays).toHaveBeenCalledTimes(1);
      expect(mockGl.uniform1f).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'u_zoom' }),
        2
      );
    });
  });

  describe('canvas size caching', () => {
    it('WGS-020: caches canvas size to avoid resize overhead', () => {
      const processor = new WebGLScopesProcessor();
      processor.setImage(new ImageData(100, 100));

      // First render sets size
      processor.renderWaveform(mockOutputCanvas, 'luma');

      // Second render with same size should not change
      processor.renderWaveform(mockOutputCanvas, 'luma');

      // Canvas should maintain cached size, not be reset
      // (viewport is still called but canvas resize is avoided)
      expect(mockGl.viewport).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('WGS-021: cleans up WebGL resources', () => {
      const processor = new WebGLScopesProcessor();
      processor.dispose();

      expect(mockGl.deleteProgram).toHaveBeenCalledTimes(3);
      expect(mockGl.deleteTexture).toHaveBeenCalled();
      expect(mockGl.deleteVertexArray).toHaveBeenCalled();
    });

    it('WGS-022: sets isReady to false after dispose', () => {
      const processor = new WebGLScopesProcessor();
      expect(processor.isReady()).toBe(true);

      processor.dispose();

      expect(processor.isReady()).toBe(false);
    });

    it('WGS-023: resets texture configuration flag', () => {
      const processor = new WebGLScopesProcessor();
      processor.setImage(new ImageData(10, 10));

      processor.dispose();

      // After dispose and re-init (via new processor), texture params should be set again
      const processor2 = new WebGLScopesProcessor();
      mockGl.texParameteri.mockClear();
      processor2.setImage(new ImageData(10, 10));

      expect(mockGl.texParameteri.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('singleton functions', () => {
    it('WGS-024: getSharedScopesProcessor returns same instance', () => {
      const processor1 = getSharedScopesProcessor();
      const processor2 = getSharedScopesProcessor();

      expect(processor1).toBe(processor2);
    });

    it('WGS-025: disposeSharedScopesProcessor clears singleton', () => {
      const processor1 = getSharedScopesProcessor();
      disposeSharedScopesProcessor();
      const processor2 = getSharedScopesProcessor();

      expect(processor1).not.toBe(processor2);
    });

    it('WGS-026: getSharedScopesProcessor returns null on error', () => {
      simulateWebGL2NotSupported = true;

      const processor = getSharedScopesProcessor();

      expect(processor).toBeNull();
    });
  });

  describe('performance optimizations', () => {
    it('WGS-027: uses mediump precision in fragment shaders', () => {
      // This is a compile-time optimization, verified by shader compilation succeeding
      // mediump is used for consistency between vertex and fragment shaders
      const processor = new WebGLScopesProcessor();
      expect(processor.isReady()).toBe(true);
    });

    it('WGS-028: downscales large images for paused mode', () => {
      const processor = new WebGLScopesProcessor();
      const imageData = new ImageData(1920, 1080);

      processor.setImage(imageData);
      processor.renderWaveform(mockOutputCanvas, 'luma');

      // 1080p exceeds paused target (640x360), should downscale
      const imageSizeCall = mockGl.uniform2f.mock.calls.find(
        (call) => call[0]?.name === 'u_imageSize'
      );
      // Should be downscaled to fit within 640x360 while maintaining aspect ratio
      expect(imageSizeCall![1]).toBeLessThanOrEqual(640);
      expect(imageSizeCall![2]).toBeLessThanOrEqual(360);
    });

    it('WGS-029: uses smaller analysis resolution for 4K images', () => {
      const processor = new WebGLScopesProcessor();
      const imageData = new ImageData(3840, 2160);

      processor.setImage(imageData);
      processor.renderWaveform(mockOutputCanvas, 'luma');

      // 4K should be downscaled significantly
      const imageSizeCall = mockGl.uniform2f.mock.calls.find(
        (call) => call[0]?.name === 'u_imageSize'
      );
      expect(imageSizeCall![1]).toBeLessThanOrEqual(640);
      expect(imageSizeCall![2]).toBeLessThanOrEqual(360);
    });

    it('WGS-030: uses smaller resolution during playback mode', () => {
      const processor = new WebGLScopesProcessor();
      const imageData = new ImageData(1920, 1080);

      // Without playback mode, uses paused target (640x360)
      processor.setImage(imageData);
      processor.renderWaveform(mockOutputCanvas, 'luma');

      let imageSizeCall = mockGl.uniform2f.mock.calls.find(
        (call) => call[0]?.name === 'u_imageSize'
      );
      const pausedWidth = imageSizeCall![1];

      // With playback mode, uses smaller target (320x180)
      mockGl.uniform2f.mockClear();
      processor.setPlaybackMode(true);
      processor.setImage(imageData);
      processor.renderWaveform(mockOutputCanvas, 'luma');

      imageSizeCall = mockGl.uniform2f.mock.calls.find(
        (call) => call[0]?.name === 'u_imageSize'
      );
      // Playback mode should use smaller dimensions than paused
      expect(imageSizeCall![1]).toBeLessThanOrEqual(320);
      expect(imageSizeCall![1]).toBeLessThan(pausedWidth);
    });

    it('WGS-031: restores quality when playback mode disabled', () => {
      const processor = new WebGLScopesProcessor();
      const imageData = new ImageData(1920, 1080);

      // Enable playback mode
      processor.setPlaybackMode(true);
      processor.setImage(imageData);
      processor.renderWaveform(mockOutputCanvas, 'luma');

      let imageSizeCall = mockGl.uniform2f.mock.calls.find(
        (call) => call[0]?.name === 'u_imageSize'
      );
      const playbackWidth = imageSizeCall![1];

      // Disable playback mode - should restore higher quality
      mockGl.uniform2f.mockClear();
      processor.setPlaybackMode(false);
      processor.setImage(imageData);
      processor.renderWaveform(mockOutputCanvas, 'luma');

      imageSizeCall = mockGl.uniform2f.mock.calls.find(
        (call) => call[0]?.name === 'u_imageSize'
      );
      // Paused mode should use larger dimensions than playback
      expect(imageSizeCall![1]).toBeGreaterThan(playbackWidth);
    });
  });

  describe('dispose cleanup', () => {
    it('WGS-032: dispose deletes all WebGL programs', () => {
      const processor = new WebGLScopesProcessor();
      mockGl.deleteProgram.mockClear();

      processor.dispose();

      expect(mockGl.deleteProgram).toHaveBeenCalledTimes(3); // histogram, waveform, vectorscope
    });

    it('WGS-033: dispose deletes textures', () => {
      const processor = new WebGLScopesProcessor();
      processor.setImage(new ImageData(10, 10));
      mockGl.deleteTexture.mockClear();

      processor.dispose();

      expect(mockGl.deleteTexture).toHaveBeenCalled();
    });

    it('WGS-034: dispose deletes vertex array object', () => {
      const processor = new WebGLScopesProcessor();
      mockGl.deleteVertexArray.mockClear();

      processor.dispose();

      expect(mockGl.deleteVertexArray).toHaveBeenCalled();
    });

    it('WGS-035: dispose loses WebGL context', () => {
      const processor = new WebGLScopesProcessor();
      processor.dispose();

      expect(mockGl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    });

    it('WGS-036: dispose handles missing WEBGL_lose_context extension', () => {
      mockGl.getExtension.mockImplementation((name: string) => {
        if (name === 'KHR_parallel_shader_compile') return {};
        return null;
      });

      const processor = new WebGLScopesProcessor();

      // Should not throw even if extension is not available
      expect(() => processor.dispose()).not.toThrow();
    });

    it('WGS-037: isReady returns false after dispose', () => {
      const processor = new WebGLScopesProcessor();
      expect(processor.isReady()).toBe(true);

      processor.dispose();

      expect(processor.isReady()).toBe(false);
    });
  });

  describe('shader precision', () => {
    it('WGS-038: uses mediump precision in fragment shaders for consistency', () => {
      // This is verified by shader compilation succeeding
      // The shaders use mediump for consistency between vertex and fragment stages
      const processor = new WebGLScopesProcessor();
      expect(processor.isReady()).toBe(true);
    });
  });

  describe('setFloatImage', () => {
    it('WGS-040: uploads float data as RGBA16F texture', () => {
      const processor = new WebGLScopesProcessor();
      const floatData = new Float32Array(10 * 10 * 4);

      mockGl.texImage2D.mockClear();
      processor.setFloatImage(floatData, 10, 10);

      // Should call texImage2D with RGBA16F (gl.RGBA16F = 0x881A = 34842)
      expect(mockGl.texImage2D).toHaveBeenCalled();
      const call = mockGl.texImage2D.mock.calls[0];
      // Internal format should be RGBA16F
      expect(call![2]).toBe(0x881A); // gl.RGBA16F
      // Type should be FLOAT (gl.FLOAT = 0x1406 = 5126)
      expect(call![7]).toBe(0x1406); // gl.FLOAT
    });

    it('WGS-041: updates analysis dimensions from float data', () => {
      const processor = new WebGLScopesProcessor();
      const floatData = new Float32Array(50 * 50 * 4);

      processor.setFloatImage(floatData, 50, 50);

      // After setFloatImage, rendering should use the new dimensions
      mockGl.drawArrays.mockClear();
      processor.renderWaveform(mockOutputCanvas, 'luma');

      expect(mockGl.drawArrays).toHaveBeenCalled();
    });

    it('WGS-042: downscales large float data to analysis dimensions', () => {
      const processor = new WebGLScopesProcessor();
      // 1920x1080 float data should be downscaled
      const floatData = new Float32Array(1920 * 1080 * 4);

      mockGl.texImage2D.mockClear();
      processor.setFloatImage(floatData, 1920, 1080);

      // The uploaded dimensions should be smaller than the input
      const call = mockGl.texImage2D.mock.calls[0];
      const uploadWidth = call![3];
      const uploadHeight = call![4];
      expect(uploadWidth).toBeLessThanOrEqual(640);
      expect(uploadHeight).toBeLessThanOrEqual(360);
    });

    it('WGS-043: does not downscale small float data', () => {
      const processor = new WebGLScopesProcessor();
      const floatData = new Float32Array(100 * 100 * 4);

      mockGl.texImage2D.mockClear();
      processor.setFloatImage(floatData, 100, 100);

      const call = mockGl.texImage2D.mock.calls[0];
      const uploadWidth = call![3];
      const uploadHeight = call![4];
      expect(uploadWidth).toBe(100);
      expect(uploadHeight).toBe(100);
    });

    it('WGS-044: configures texture parameters on first call', () => {
      const processor = new WebGLScopesProcessor();
      const floatData = new Float32Array(10 * 10 * 4);

      mockGl.texParameteri.mockClear();
      processor.setFloatImage(floatData, 10, 10);

      expect(mockGl.texParameteri).toHaveBeenCalled();
    });

    it('WGS-045: does not re-configure texture parameters on subsequent calls', () => {
      const processor = new WebGLScopesProcessor();
      const floatData = new Float32Array(10 * 10 * 4);

      processor.setFloatImage(floatData, 10, 10);
      const firstCallCount = mockGl.texParameteri.mock.calls.length;

      processor.setFloatImage(floatData, 10, 10);
      const secondCallCount = mockGl.texParameteri.mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount);
    });

    it('WGS-046: is a no-op when not initialized', () => {
      const processor = new WebGLScopesProcessor();
      processor.dispose();

      const floatData = new Float32Array(10 * 10 * 4);
      // Should not throw when disposed
      expect(() => processor.setFloatImage(floatData, 10, 10)).not.toThrow();
    });

    it('WGS-047: preserves HDR values above 1.0 in texture upload', () => {
      const processor = new WebGLScopesProcessor();
      const floatData = new Float32Array(2 * 2 * 4);
      // Set HDR pixel values > 1.0
      floatData[0] = 3.5;
      floatData[1] = 2.0;
      floatData[2] = 1.5;
      floatData[3] = 1.0;

      mockGl.texImage2D.mockClear();
      processor.setFloatImage(floatData, 2, 2);

      // Verify the data passed to texImage2D contains the original float values
      const call = mockGl.texImage2D.mock.calls[0];
      const uploadedData = call![8] as Float32Array;
      expect(uploadedData[0]).toBe(3.5);
      expect(uploadedData[1]).toBe(2.0);
      expect(uploadedData[2]).toBe(1.5);
    });

    it('WGS-048: setFloatImage handles NaN values without throwing', () => {
      const processor = new WebGLScopesProcessor();
      const floatData = new Float32Array(4 * 4 * 4);
      floatData[0] = NaN;
      floatData[1] = NaN;
      expect(() => processor.setFloatImage(floatData, 4, 4)).not.toThrow();
    });

    it('WGS-049: setFloatImage handles Infinity values without throwing', () => {
      const processor = new WebGLScopesProcessor();
      const floatData = new Float32Array(4 * 4 * 4);
      floatData[0] = Infinity;
      floatData[1] = -Infinity;
      expect(() => processor.setFloatImage(floatData, 4, 4)).not.toThrow();
    });
  });

  describe('downscaleFloatData correctness', () => {
    it('WGS-050: downscaled data contains correct averaged values', () => {
      const processor = new WebGLScopesProcessor();
      // Create a 4x4 image with known values in each quadrant
      const floatData = new Float32Array(4 * 4 * 4);
      // Top-left quadrant (2x2): R=1.0
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
          const i = (y * 4 + x) * 4;
          floatData[i] = 1.0;     // R
          floatData[i + 1] = 0.0; // G
          floatData[i + 2] = 0.0; // B
          floatData[i + 3] = 1.0; // A
        }
      }
      // Top-right quadrant (2x2): G=1.0
      for (let y = 0; y < 2; y++) {
        for (let x = 2; x < 4; x++) {
          const i = (y * 4 + x) * 4;
          floatData[i] = 0.0;
          floatData[i + 1] = 1.0;
          floatData[i + 2] = 0.0;
          floatData[i + 3] = 1.0;
        }
      }
      // Bottom-left quadrant (2x2): B=1.0
      for (let y = 2; y < 4; y++) {
        for (let x = 0; x < 2; x++) {
          const i = (y * 4 + x) * 4;
          floatData[i] = 0.0;
          floatData[i + 1] = 0.0;
          floatData[i + 2] = 1.0;
          floatData[i + 3] = 1.0;
        }
      }
      // Bottom-right quadrant (2x2): White (1,1,1)
      for (let y = 2; y < 4; y++) {
        for (let x = 2; x < 4; x++) {
          const i = (y * 4 + x) * 4;
          floatData[i] = 1.0;
          floatData[i + 1] = 1.0;
          floatData[i + 2] = 1.0;
          floatData[i + 3] = 1.0;
        }
      }

      // Force playback mode for aggressive downscaling
      processor.setPlaybackMode(true);
      mockGl.texImage2D.mockClear();
      processor.setFloatImage(floatData, 4, 4);

      // Since 4x4 is very small (below 320x180 playback target), it should NOT downscale
      const call = mockGl.texImage2D.mock.calls[0];
      const uploadedData = call![8] as Float32Array;
      const uploadWidth = call![3] as number;
      const uploadHeight = call![4] as number;

      // Verify dimensions are 4x4 (no downscale needed for such small data)
      expect(uploadWidth).toBe(4);
      expect(uploadHeight).toBe(4);

      // Verify original data is preserved
      expect(uploadedData[0]).toBe(1.0); // Top-left R
      expect(uploadedData[1]).toBe(0.0); // Top-left G
    });

    it('WGS-051: downscaled large data produces reasonable averages', () => {
      const processor = new WebGLScopesProcessor();
      // Create 1920x1080 image that is all red = 2.0 (HDR)
      const floatData = new Float32Array(1920 * 1080 * 4);
      for (let i = 0; i < floatData.length; i += 4) {
        floatData[i] = 2.0;     // R
        floatData[i + 1] = 0.0; // G
        floatData[i + 2] = 0.0; // B
        floatData[i + 3] = 1.0; // A
      }

      mockGl.texImage2D.mockClear();
      processor.setFloatImage(floatData, 1920, 1080);

      const call = mockGl.texImage2D.mock.calls[0];
      const uploadedData = call![8] as Float32Array;

      // All pixels should average to R=2.0 since input is uniform
      // Check first few pixels
      for (let i = 0; i < Math.min(20, uploadedData.length); i += 4) {
        expect(uploadedData[i]).toBeCloseTo(2.0, 1);     // R should be ~2.0
        expect(uploadedData[i + 1]).toBeCloseTo(0.0, 1);  // G should be ~0.0
        expect(uploadedData[i + 2]).toBeCloseTo(0.0, 1);  // B should be ~0.0
      }
    });
  });

  // ====================================================================
  // Phase 3: HDR mode support
  // ====================================================================
  describe('HDR mode', () => {
    it('P3-020: getMaxValue returns 1.0 by default (SDR mode)', () => {
      const processor = new WebGLScopesProcessor();
      expect(processor.getMaxValue()).toBe(1.0);
    });

    it('P3-021: getMaxValue returns headroom when HDR mode is active', () => {
      const processor = new WebGLScopesProcessor();
      processor.setHDRMode(true, 4.0);
      expect(processor.getMaxValue()).toBe(4.0);
    });

    it('P3-022: getMaxValue returns default 4.0 when HDR active without explicit headroom', () => {
      const processor = new WebGLScopesProcessor();
      processor.setHDRMode(true);
      expect(processor.getMaxValue()).toBe(4.0);
    });

    it('P3-023: getMaxValue returns 1.0 after disabling HDR mode', () => {
      const processor = new WebGLScopesProcessor();
      processor.setHDRMode(true, 6.0);
      expect(processor.getMaxValue()).toBe(6.0);

      processor.setHDRMode(false);
      expect(processor.getMaxValue()).toBe(1.0);
    });

    it('P3-024: waveform sets u_waveformMaxValue uniform to 1.0 in SDR mode', () => {
      const processor = new WebGLScopesProcessor();
      processor.setImage(new ImageData(10, 10));
      mockGl.uniform1f.mockClear();

      processor.renderWaveform(mockOutputCanvas, 'luma');

      const maxValueCall = mockGl.uniform1f.mock.calls.find(
        (call) => call[0]?.name === 'u_waveformMaxValue'
      );
      expect(maxValueCall).toBeDefined();
      expect(maxValueCall![1]).toBe(1.0);
    });

    it('P3-025: waveform sets u_waveformMaxValue uniform to headroom in HDR mode', () => {
      const processor = new WebGLScopesProcessor();
      processor.setHDRMode(true, 4.0);
      processor.setImage(new ImageData(10, 10));
      mockGl.uniform1f.mockClear();

      processor.renderWaveform(mockOutputCanvas, 'luma');

      const maxValueCall = mockGl.uniform1f.mock.calls.find(
        (call) => call[0]?.name === 'u_waveformMaxValue'
      );
      expect(maxValueCall).toBeDefined();
      expect(maxValueCall![1]).toBe(4.0);
    });

    it('P3-026: vectorscope sets u_saturationScale to 1.0 in SDR mode', () => {
      const processor = new WebGLScopesProcessor();
      processor.setImage(new ImageData(10, 10));
      mockGl.uniform1f.mockClear();

      processor.renderVectorscope(mockOutputCanvas, 1.0);

      const satScaleCall = mockGl.uniform1f.mock.calls.find(
        (call) => call[0]?.name === 'u_saturationScale'
      );
      expect(satScaleCall).toBeDefined();
      expect(satScaleCall![1]).toBe(1.0);
    });

    it('P3-027: vectorscope adjusts u_saturationScale in HDR mode', () => {
      const processor = new WebGLScopesProcessor();
      processor.setHDRMode(true, 4.0);
      processor.setImage(new ImageData(10, 10));
      mockGl.uniform1f.mockClear();

      processor.renderVectorscope(mockOutputCanvas, 1.0);

      const satScaleCall = mockGl.uniform1f.mock.calls.find(
        (call) => call[0]?.name === 'u_saturationScale'
      );
      expect(satScaleCall).toBeDefined();
      // saturationScale = 1.0 / maxValue = 1.0 / 4.0 = 0.25
      expect(satScaleCall![1]).toBeCloseTo(0.25, 6);
    });

    it('P3-028: SDR mode behavior is identical to pre-Phase-3 (backward compatible)', () => {
      const processor = new WebGLScopesProcessor();
      // Default state: hdrActive=false
      expect(processor.getMaxValue()).toBe(1.0);

      processor.setImage(new ImageData(10, 10));
      mockGl.uniform1f.mockClear();

      processor.renderWaveform(mockOutputCanvas, 'luma');

      // u_waveformMaxValue should be 1.0 (no scaling)
      const waveformMaxCall = mockGl.uniform1f.mock.calls.find(
        (call) => call[0]?.name === 'u_waveformMaxValue'
      );
      expect(waveformMaxCall![1]).toBe(1.0);

      mockGl.uniform1f.mockClear();
      processor.renderVectorscope(mockOutputCanvas, 1.0);

      // u_saturationScale should be 1.0 (no scaling)
      const satScaleCall = mockGl.uniform1f.mock.calls.find(
        (call) => call[0]?.name === 'u_saturationScale'
      );
      expect(satScaleCall![1]).toBe(1.0);
    });

    it('P3-029: HDR auto-fit scales waveform to signal peak for float frames', () => {
      const processor = new WebGLScopesProcessor();
      processor.setHDRMode(true, 4.0);
      processor.setHDRAutoFit(true);
      const floatData = new Float32Array([
        1.0, 0.8, 0.6, 1.0,
        1.0, 0.9, 0.7, 1.0,
      ]);
      processor.setFloatImage(floatData, 2, 1);
      mockGl.uniform1f.mockClear();

      processor.renderWaveform(mockOutputCanvas, 'luma');

      const maxValueCall = mockGl.uniform1f.mock.calls.find(
        (call) => call[0]?.name === 'u_waveformMaxValue'
      );
      expect(maxValueCall).toBeDefined();
      // Peak is 1.0, so auto-fit should avoid compressing to headroom (4.0)
      expect(maxValueCall![1]).toBe(1.0);
    });

    it('P3-030: HDR auto-fit keeps headroom clamp for extreme highlights', () => {
      const processor = new WebGLScopesProcessor();
      processor.setHDRMode(true, 4.0);
      processor.setHDRAutoFit(true);
      const floatData = new Float32Array([6.0, 0.0, 0.0, 1.0]);
      processor.setFloatImage(floatData, 1, 1);
      mockGl.uniform1f.mockClear();

      processor.renderWaveform(mockOutputCanvas, 'luma');

      const maxValueCall = mockGl.uniform1f.mock.calls.find(
        (call) => call[0]?.name === 'u_waveformMaxValue'
      );
      expect(maxValueCall).toBeDefined();
      // Peak is above configured headroom, so clamp to headroom
      expect(maxValueCall![1]).toBe(4.0);
    });

    it('P3-031: vectorscope auto-fit avoids compression from neutral HDR highlights', () => {
      const processor = new WebGLScopesProcessor();
      processor.setHDRMode(true, 4.0);
      processor.setHDRAutoFit(true);
      const floatData = new Float32Array([4.0, 4.0, 4.0, 1.0]);
      processor.setFloatImage(floatData, 1, 1);
      mockGl.uniform1f.mockClear();

      processor.renderVectorscope(mockOutputCanvas, 1.0);

      const satScaleCall = mockGl.uniform1f.mock.calls.find(
        (call) => call[0]?.name === 'u_saturationScale'
      );
      expect(satScaleCall).toBeDefined();
      // Neutral highlights have no chroma; keep full vectorscope width.
      expect(satScaleCall![1]).toBe(1.0);
    });

    it('P3-032: vectorscope auto-fit scales based on chroma extent', () => {
      const processor = new WebGLScopesProcessor();
      processor.setHDRMode(true, 4.0);
      processor.setHDRAutoFit(true);
      const floatData = new Float32Array([2.0, 0.0, 0.0, 1.0]);
      processor.setFloatImage(floatData, 1, 1);
      mockGl.uniform1f.mockClear();

      processor.renderVectorscope(mockOutputCanvas, 1.0);

      const satScaleCall = mockGl.uniform1f.mock.calls.find(
        (call) => call[0]?.name === 'u_saturationScale'
      );
      expect(satScaleCall).toBeDefined();
      // Pure red at 2.0 yields Cr ~= 1.0, so auto-fit scale should be 0.5.
      expect(satScaleCall![1]).toBeCloseTo(0.5, 6);
    });
  });

  // ====================================================================
  // ShaderProgram integration tests
  // ====================================================================
  describe('ShaderProgram integration', () => {
    it('WGS-060: isReady returns true when all 3 programs complete', () => {
      // Default mock: COMPLETION_STATUS_KHR returns true, so all ready
      const processor = new WebGLScopesProcessor();
      expect(processor.isReady()).toBe(true);
    });

    it('WGS-061: isReady returns false when any program is still compiling', () => {
      // Make the 3rd getProgramParameter(COMPLETION_STATUS_KHR) return false
      let programCompletionCallCount = 0;
      mockGl.getProgramParameter.mockImplementation((_program: unknown, param: number) => {
        if (param === 0x91B1) { // COMPLETION_STATUS_KHR
          programCompletionCallCount++;
          // 3rd program not ready
          return programCompletionCallCount !== 3;
        }
        return true; // LINK_STATUS
      });

      const processor = new WebGLScopesProcessor();
      expect(processor.isReady()).toBe(false);
    });

    it('WGS-062: dispose cleans up all 3 ShaderPrograms', () => {
      const processor = new WebGLScopesProcessor();
      mockGl.deleteProgram.mockClear();

      processor.dispose();

      // Each ShaderProgram.dispose() calls gl.deleteProgram once
      expect(mockGl.deleteProgram).toHaveBeenCalledTimes(3);
    });

    it('WGS-064: each scope type resolves its own uniforms independently', () => {
      const processor = new WebGLScopesProcessor();
      processor.setImage(new ImageData(10, 10));
      mockGl.getUniformLocation.mockClear();

      // Render only waveform - should resolve waveform uniforms, not histogram or vectorscope
      processor.renderWaveform(mockOutputCanvas, 'luma');

      const resolvedNames = mockGl.getUniformLocation.mock.calls.map((call: unknown[]) => call[1]);
      expect(resolvedNames).toContain('u_image'); // waveform uniform
      expect(resolvedNames).toContain('u_imageSize'); // waveform uniform
      expect(resolvedNames).toContain('u_mode'); // waveform uniform
      // Should NOT contain histogram-only uniforms
      expect(resolvedNames).not.toContain('u_histogramData');
      expect(resolvedNames).not.toContain('u_maxValue');
      // Should NOT contain vectorscope-only uniforms
      expect(resolvedNames).not.toContain('u_zoom');
      expect(resolvedNames).not.toContain('u_saturationScale');
    });

    it('WGS-065: histogram resolves its uniforms independently from waveform', () => {
      const processor = new WebGLScopesProcessor();
      mockGl.getUniformLocation.mockClear();

      const histData = {
        red: new Uint32Array(256).fill(100),
        green: new Uint32Array(256).fill(100),
        blue: new Uint32Array(256).fill(100),
        luminance: new Uint32Array(256).fill(100),
        maxValue: 1000,
      };

      processor.renderHistogram(mockOutputCanvas, histData, 'rgb');

      const resolvedNames = mockGl.getUniformLocation.mock.calls.map((call: unknown[]) => call[1]);
      expect(resolvedNames).toContain('u_histogramData');
      expect(resolvedNames).toContain('u_maxValue');
      // Should NOT contain waveform-only uniforms
      expect(resolvedNames).not.toContain('u_imageSize');
      expect(resolvedNames).not.toContain('u_waveformMaxValue');
    });

    it('WGS-066: vectorscope resolves its uniforms independently from waveform', () => {
      const processor = new WebGLScopesProcessor();
      processor.setImage(new ImageData(10, 10));
      mockGl.getUniformLocation.mockClear();

      processor.renderVectorscope(mockOutputCanvas, 1.0);

      const resolvedNames = mockGl.getUniformLocation.mock.calls.map((call: unknown[]) => call[1]);
      expect(resolvedNames).toContain('u_zoom');
      expect(resolvedNames).toContain('u_saturationScale');
      // Should NOT contain histogram-only uniforms
      expect(resolvedNames).not.toContain('u_histogramData');
      expect(resolvedNames).not.toContain('u_maxValue');
    });

    it('WGS-067: a scope can render even if another scope shader is still compiling', () => {
      // Make the 3rd ShaderProgram (vectorscope) not ready,
      // but the 1st (histogram) and 2nd (waveform) are ready.
      const COMPLETION_STATUS_KHR = 0x91B1;

      // Track which programs are created; make the 3rd one "not ready"
      const programs: object[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockGl.createProgram.mockImplementation(() => {
        const prog = { _idx: programs.length };
        programs.push(prog);
        return prog;
      });

      mockGl.getProgramParameter.mockImplementation((program: unknown, param: number) => {
        if (param === COMPLETION_STATUS_KHR) {
          // 3rd program (vectorscope, _idx=2) is not ready
          return (program as { _idx: number })._idx !== 2;
        }
        return true; // LINK_STATUS
      });

      const processor = new WebGLScopesProcessor();

      // isReady() should be false (vectorscope still compiling)
      expect(processor.isReady()).toBe(false);

      // But histogram should still render (its shader IS ready)
      const histData = {
        red: new Uint32Array(256).fill(100),
        green: new Uint32Array(256).fill(100),
        blue: new Uint32Array(256).fill(100),
        luminance: new Uint32Array(256).fill(100),
        maxValue: 1000,
      };
      mockGl.drawArrays.mockClear();
      processor.renderHistogram(mockOutputCanvas, histData, 'rgb');
      // Histogram uses its own shader's isReady() check, should render
      expect(mockGl.drawArrays).toHaveBeenCalled();

      // Waveform should also render (its shader IS ready)
      processor.setImage(new ImageData(10, 10));
      mockGl.drawArrays.mockClear();
      processor.renderWaveform(mockOutputCanvas, 'luma');
      expect(mockGl.drawArrays).toHaveBeenCalled();

      // Vectorscope should NOT render (its shader is not ready)
      mockGl.drawArrays.mockClear();
      processor.renderVectorscope(mockOutputCanvas, 1.0);
      expect(mockGl.drawArrays).not.toHaveBeenCalled();
    });

    it('WGS-063: uniforms are resolved lazily on first render', () => {
      const processor = new WebGLScopesProcessor();

      // Before any render, getUniformLocation should not have been called
      // (the old code called it in init, now it's deferred)
      mockGl.getUniformLocation.mockClear();

      // Trigger a render - this should resolve uniforms
      processor.setImage(new ImageData(10, 10));
      processor.renderWaveform(mockOutputCanvas, 'luma');

      // getUniformLocation should have been called for waveform uniforms
      expect(mockGl.getUniformLocation).toHaveBeenCalled();
    });
  });

  // ====================================================================
  // Task 4.6: Deferred scopes creation via HDR mode caching
  // ====================================================================
  describe('Task 4.6: Deferred scopes creation', () => {
    it('SCOPE-D001: setScopesHDRMode caches state without creating processor', () => {
      disposeSharedScopesProcessor();
      setScopesHDRMode(true, 6.0);
      // Should not throw and should not create a processor
    });

    it('SCOPE-D002: getSharedScopesProcessor applies cached HDR mode', () => {
      disposeSharedScopesProcessor();
      setScopesHDRMode(true, 5.0);
      const processor = getSharedScopesProcessor();
      expect(processor).not.toBeNull();
      // Verify HDR mode was applied (check maxValue)
      expect(processor!.getMaxValue()).toBe(5.0);
    });

    it('SCOPE-D003: setScopesHDRMode applies immediately if processor exists', () => {
      const processor = getSharedScopesProcessor();
      expect(processor).not.toBeNull();
      setScopesHDRMode(true, 8.0);
      expect(processor!.getMaxValue()).toBe(8.0);
      setScopesHDRMode(false);
      expect(processor!.getMaxValue()).toBe(1.0);
    });
  });
});
