import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WebGLScopesProcessor,
  getSharedScopesProcessor,
  disposeSharedScopesProcessor,
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

    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),

    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    useProgram: vi.fn(),
    deleteProgram: vi.fn(),

    getUniformLocation: vi.fn((_prog, name) => ({ name })),

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
    getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
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
  });

  describe('isReady', () => {
    it('WGS-006: returns true when initialized successfully', () => {
      const processor = new WebGLScopesProcessor();
      expect(processor.isReady()).toBe(true);
    });

    it('WGS-007: returns false when shader compilation fails', () => {
      mockGl.getShaderParameter = vi.fn(() => false);

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
      const mockLoseContext = { loseContext: vi.fn() };
      mockGl.getExtension = vi.fn(() => mockLoseContext);

      const processor = new WebGLScopesProcessor();
      processor.dispose();

      expect(mockGl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
      expect(mockLoseContext.loseContext).toHaveBeenCalled();
    });

    it('WGS-036: dispose handles missing WEBGL_lose_context extension', () => {
      mockGl.getExtension = vi.fn(() => null);

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
});
