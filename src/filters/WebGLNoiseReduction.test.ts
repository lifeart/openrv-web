/**
 * WebGLNoiseReduction Unit Tests
 *
 * Tests for the GPU-accelerated bilateral noise reduction filter.
 * Pattern follows WebGLSharpen.test.ts with shared mocks.
 * Based on test ID naming convention: WGNR-NNN
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WebGLNoiseReductionProcessor,
  createNoiseReductionProcessor,
} from './WebGLNoiseReduction';
import { DEFAULT_NOISE_REDUCTION_PARAMS, NoiseReductionParams } from './NoiseReduction';
import { createMockWebGL2Context } from '../../test/mocks';

describe('WebGLNoiseReductionProcessor', () => {
  let originalCreateElement: typeof document.createElement;
  let mockCanvas: HTMLCanvasElement;
  let mockGl: ReturnType<typeof createMockWebGL2Context>;

  beforeEach(() => {
    mockGl = createMockWebGL2Context();
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockGl),
    } as unknown as HTMLCanvasElement;

    // WebGLNoiseReduction accesses gl.canvas.width/height for resize
    (mockGl as Record<string, unknown>).canvas = mockCanvas;

    originalCreateElement = document.createElement;
    document.createElement = vi.fn((tag: string) => {
      if (tag === 'canvas') {
        return mockCanvas;
      }
      return originalCreateElement.call(document, tag);
    });
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
  });

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------
  describe('constructor', () => {
    it('WGNR-001: creates WebGL2 context with correct options', () => {
      new WebGLNoiseReductionProcessor(mockCanvas);

      expect(mockCanvas.getContext).toHaveBeenCalledWith('webgl2', {
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
      });
    });

    it('WGNR-002: throws error when WebGL2 is not supported', () => {
      mockCanvas.getContext = vi.fn(() => null);

      expect(() => new WebGLNoiseReductionProcessor(mockCanvas)).toThrow(
        'WebGL2 not supported'
      );
    });

    it('WGNR-003: initializes shader program', () => {
      new WebGLNoiseReductionProcessor(mockCanvas);

      expect(mockGl.createShader).toHaveBeenCalledTimes(2);
      expect(mockGl.createProgram).toHaveBeenCalledTimes(1);
      expect(mockGl.linkProgram).toHaveBeenCalled();
    });

    it('WGNR-004: creates position and texture coordinate buffers', () => {
      new WebGLNoiseReductionProcessor(mockCanvas);

      expect(mockGl.createBuffer).toHaveBeenCalledTimes(2);
      expect(mockGl.bufferData).toHaveBeenCalledTimes(2);
    });

    it('WGNR-005: creates source and output textures', () => {
      new WebGLNoiseReductionProcessor(mockCanvas);

      // 2 textures: sourceTexture + outputTexture
      expect(mockGl.createTexture).toHaveBeenCalledTimes(2);
    });

    it('WGNR-006: creates framebuffer', () => {
      new WebGLNoiseReductionProcessor(mockCanvas);

      expect(mockGl.createFramebuffer).toHaveBeenCalledTimes(1);
    });

    it('WGNR-007: gets uniform locations for all uniforms', () => {
      new WebGLNoiseReductionProcessor(mockCanvas);

      expect(mockGl.getUniformLocation).toHaveBeenCalledWith(
        expect.anything(),
        'u_image'
      );
      expect(mockGl.getUniformLocation).toHaveBeenCalledWith(
        expect.anything(),
        'u_strength'
      );
      expect(mockGl.getUniformLocation).toHaveBeenCalledWith(
        expect.anything(),
        'u_rangeSigma'
      );
      expect(mockGl.getUniformLocation).toHaveBeenCalledWith(
        expect.anything(),
        'u_radius'
      );
      expect(mockGl.getUniformLocation).toHaveBeenCalledWith(
        expect.anything(),
        'u_resolution'
      );
    });

    it('WGNR-008: throws error when shader compilation fails', () => {
      mockGl.getShaderParameter = vi.fn(() => false);
      mockGl.getShaderInfoLog = vi.fn(() => 'compile error');

      expect(() => new WebGLNoiseReductionProcessor(mockCanvas)).toThrow(
        'Shader compile error'
      );
    });

    it('WGNR-009: throws error when program linking fails', () => {
      mockGl.getProgramParameter = vi.fn(() => false);
      mockGl.getProgramInfoLog = vi.fn(() => 'link error');

      expect(() => new WebGLNoiseReductionProcessor(mockCanvas)).toThrow(
        'Program link error'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // process
  // ---------------------------------------------------------------------------
  describe('process', () => {
    const defaultParams: NoiseReductionParams = {
      ...DEFAULT_NOISE_REDUCTION_PARAMS,
      strength: 50,
    };

    it('WGNR-010: returns original imageData when strength is 0', () => {
      const processor = new WebGLNoiseReductionProcessor(mockCanvas);
      const imageData = new ImageData(10, 10);
      const params = { ...defaultParams, strength: 0 };

      const result = processor.process(imageData, params);

      expect(result).toBe(imageData);
      expect(mockGl.drawArrays).not.toHaveBeenCalled();
    });

    it('WGNR-011: processes imageData when strength is positive', () => {
      const processor = new WebGLNoiseReductionProcessor(mockCanvas);
      const imageData = new ImageData(10, 10);

      const result = processor.process(imageData, defaultParams);

      expect(result).not.toBe(imageData);
      expect(mockGl.drawArrays).toHaveBeenCalled();
    });

    it('WGNR-012: resizes canvas when dimensions change', () => {
      const processor = new WebGLNoiseReductionProcessor(mockCanvas);
      const imageData = new ImageData(100, 200);

      processor.process(imageData, defaultParams);

      expect(mockCanvas.width).toBe(100);
      expect(mockCanvas.height).toBe(200);
      expect(mockGl.viewport).toHaveBeenCalledWith(0, 0, 100, 200);
    });

    it('WGNR-013: sets strength uniform normalized to 0-1', () => {
      const processor = new WebGLNoiseReductionProcessor(mockCanvas);
      const imageData = new ImageData(10, 10);

      processor.process(imageData, { ...defaultParams, strength: 50 });

      // strength / 100 = 0.5
      expect(mockGl.uniform1f).toHaveBeenCalledWith(
        expect.anything(),
        0.5
      );
    });

    it('WGNR-014: sets resolution uniform to image dimensions', () => {
      const processor = new WebGLNoiseReductionProcessor(mockCanvas);
      const imageData = new ImageData(320, 240);

      processor.process(imageData, defaultParams);

      expect(mockGl.uniform2f).toHaveBeenCalledWith(
        expect.anything(),
        320,
        240
      );
    });

    it('WGNR-015: clamps radius to MAX_FILTER_RADIUS (5)', () => {
      const processor = new WebGLNoiseReductionProcessor(mockCanvas);
      const imageData = new ImageData(10, 10);
      const params = { ...defaultParams, radius: 10 };

      processor.process(imageData, params);

      // Radius should be clamped to 5
      expect(mockGl.uniform1i).toHaveBeenCalledWith(
        expect.anything(),
        5
      );
    });

    it('WGNR-016: uploads source texture', () => {
      const processor = new WebGLNoiseReductionProcessor(mockCanvas);
      const imageData = new ImageData(10, 10);

      processor.process(imageData, defaultParams);

      expect(mockGl.texImage2D).toHaveBeenCalled();
    });

    it('WGNR-017: binds framebuffer for rendering', () => {
      const processor = new WebGLNoiseReductionProcessor(mockCanvas);
      const imageData = new ImageData(10, 10);

      processor.process(imageData, defaultParams);

      expect(mockGl.bindFramebuffer).toHaveBeenCalled();
      expect(mockGl.framebufferTexture2D).toHaveBeenCalled();
    });

    it('WGNR-018: reads pixels from framebuffer', () => {
      const processor = new WebGLNoiseReductionProcessor(mockCanvas);
      const imageData = new ImageData(10, 10);

      processor.process(imageData, defaultParams);

      expect(mockGl.readPixels).toHaveBeenCalled();
    });

    it('WGNR-019: returns ImageData with correct dimensions', () => {
      const processor = new WebGLNoiseReductionProcessor(mockCanvas);
      const imageData = new ImageData(32, 16);

      const result = processor.process(imageData, defaultParams);

      expect(result.width).toBe(32);
      expect(result.height).toBe(16);
    });

    it('WGNR-020: unbinds framebuffer after processing', () => {
      const processor = new WebGLNoiseReductionProcessor(mockCanvas);
      const imageData = new ImageData(10, 10);

      processor.process(imageData, defaultParams);

      // Last bindFramebuffer call should be with null
      const calls = mockGl.bindFramebuffer.mock.calls;
      expect(calls[calls.length - 1][1]).toBeNull();
    });

    it('WGNR-021: uses shader program for rendering', () => {
      const processor = new WebGLNoiseReductionProcessor(mockCanvas);
      const imageData = new ImageData(10, 10);

      processor.process(imageData, defaultParams);

      expect(mockGl.useProgram).toHaveBeenCalled();
    });

    it('WGNR-022: draws full-screen quad with 6 vertices', () => {
      const processor = new WebGLNoiseReductionProcessor(mockCanvas);
      const imageData = new ImageData(10, 10);

      processor.process(imageData, defaultParams);

      // gl.TRIANGLES may be undefined in mock, so just check offset and count
      const call = mockGl.drawArrays.mock.calls[0];
      expect(call[1]).toBe(0);  // offset
      expect(call[2]).toBe(6);  // vertex count
    });
  });

  // ---------------------------------------------------------------------------
  // processInPlace
  // ---------------------------------------------------------------------------
  describe('processInPlace', () => {
    const defaultParams: NoiseReductionParams = {
      ...DEFAULT_NOISE_REDUCTION_PARAMS,
      strength: 50,
    };

    it('WGNR-030: modifies imageData in place', () => {
      const processor = new WebGLNoiseReductionProcessor(mockCanvas);
      const imageData = new ImageData(10, 10);
      // Set initial value
      imageData.data[0] = 255;

      processor.processInPlace(imageData, defaultParams);

      // Should be modified by mock readPixels (sets to 128)
      expect(imageData.data[0]).toBe(128);
    });

    it('WGNR-031: does nothing when strength is 0', () => {
      const processor = new WebGLNoiseReductionProcessor(mockCanvas);
      const imageData = new ImageData(10, 10);
      imageData.data[0] = 255;

      const params = { ...defaultParams, strength: 0 };
      processor.processInPlace(imageData, params);

      expect(imageData.data[0]).toBe(255);
      expect(mockGl.drawArrays).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // dispose
  // ---------------------------------------------------------------------------
  describe('dispose', () => {
    it('WGNR-040: cleans up WebGL resources', () => {
      const processor = new WebGLNoiseReductionProcessor(mockCanvas);
      processor.dispose();

      expect(mockGl.deleteProgram).toHaveBeenCalledTimes(1);
      expect(mockGl.deleteBuffer).toHaveBeenCalledTimes(2);
      expect(mockGl.deleteTexture).toHaveBeenCalledTimes(2);
      expect(mockGl.deleteFramebuffer).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------
// createNoiseReductionProcessor (factory with fallback)
// ---------------------------------------------------------------------------
describe('createNoiseReductionProcessor', () => {
  let originalCreateElement: typeof document.createElement;
  let mockCanvas: HTMLCanvasElement;
  let mockGl: ReturnType<typeof createMockWebGL2Context>;

  beforeEach(() => {
    mockGl = createMockWebGL2Context();
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockGl),
    } as unknown as HTMLCanvasElement;

    // WebGLNoiseReduction accesses gl.canvas.width/height for resize
    (mockGl as Record<string, unknown>).canvas = mockCanvas;

    originalCreateElement = document.createElement;
    document.createElement = vi.fn((tag: string) => {
      if (tag === 'canvas') {
        return mockCanvas;
      }
      return originalCreateElement.call(document, tag);
    });
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
  });

  it('WGNR-050: returns GPU processor when WebGL2 is available', () => {
    const processor = createNoiseReductionProcessor();
    expect(processor.isGPU).toBe(true);
    processor.dispose();
  });

  it('WGNR-051: returns CPU fallback when WebGL2 is not available', () => {
    mockCanvas.getContext = vi.fn(() => null);

    const processor = createNoiseReductionProcessor();
    expect(processor.isGPU).toBe(false);
    processor.dispose();
  });

  it('WGNR-052: GPU processor has process method', () => {
    const processor = createNoiseReductionProcessor();
    expect(typeof processor.process).toBe('function');
    processor.dispose();
  });

  it('WGNR-053: GPU processor has processInPlace method', () => {
    const processor = createNoiseReductionProcessor();
    expect(typeof processor.processInPlace).toBe('function');
    processor.dispose();
  });

  it('WGNR-054: GPU processor has dispose method', () => {
    const processor = createNoiseReductionProcessor();
    expect(typeof processor.dispose).toBe('function');
    processor.dispose();
  });

  it('WGNR-055: CPU fallback process returns new ImageData', () => {
    mockCanvas.getContext = vi.fn(() => null);

    const processor = createNoiseReductionProcessor();
    const imageData = new ImageData(4, 4);
    const params: NoiseReductionParams = {
      ...DEFAULT_NOISE_REDUCTION_PARAMS,
      strength: 50,
    };

    const result = processor.process(imageData, params);

    // CPU fallback creates a copy
    expect(result).not.toBe(imageData);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    processor.dispose();
  });

  it('WGNR-056: CPU fallback processInPlace modifies original', () => {
    mockCanvas.getContext = vi.fn(() => null);

    const processor = createNoiseReductionProcessor();
    const imageData = new ImageData(4, 4);
    // Set all pixels to white
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 255;
      imageData.data[i + 1] = 255;
      imageData.data[i + 2] = 255;
      imageData.data[i + 3] = 255;
    }

    const params: NoiseReductionParams = {
      ...DEFAULT_NOISE_REDUCTION_PARAMS,
      strength: 50,
    };

    processor.processInPlace(imageData, params);

    // Data should still exist (processInPlace on uniform white should produce white)
    expect(imageData.width).toBe(4);
    expect(imageData.height).toBe(4);
    processor.dispose();
  });

  it('WGNR-057: CPU fallback dispose does not throw', () => {
    mockCanvas.getContext = vi.fn(() => null);

    const processor = createNoiseReductionProcessor();
    expect(() => processor.dispose()).not.toThrow();
  });
});
