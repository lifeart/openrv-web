import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WebGLLUTProcessor,
  getSharedLUTProcessor,
  disposeSharedLUTProcessor,
} from './WebGLLUT';
import type { LUT3D } from './LUTLoader';

// Mock WebGL2 context
function createMockWebGL2Context() {
  const textures: object[] = [];
  const buffers: object[] = [];
  const programs: object[] = [];
  const shaders: object[] = [];

  return {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
    LINK_STATUS: 35714,
    COMPILE_STATUS: 35713,
    TEXTURE_2D: 3553,
    TEXTURE_3D: 32879,
    TEXTURE0: 33984,
    TEXTURE1: 33985,
    RGBA: 6408,
    RGB: 6407,
    UNSIGNED_BYTE: 5121,
    LINEAR: 9729,
    NEAREST: 9728,
    CLAMP_TO_EDGE: 33071,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    TEXTURE_WRAP_R: 32882,
    FRAMEBUFFER: 36160,
    TRIANGLE_STRIP: 5,
    COLOR_ATTACHMENT0: 36064,
    FRAMEBUFFER_COMPLETE: 36053,
    NO_ERROR: 0,
    HALF_FLOAT: 0x140B,
    RGBA32F: 0x8814,
    RGBA16F: 0x881A,
    RGBA8: 0x8058,
    RGB32F: 0x8815,

    getExtension: vi.fn((name: string) => {
      if (name === 'EXT_color_buffer_float') return {};
      if (name === 'OES_texture_float_linear') return {};
      return null;
    }),
    getError: vi.fn(() => 0),

    createShader: vi.fn(() => {
      const shader = {};
      shaders.push(shader);
      return shader;
    }),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),

    createProgram: vi.fn(() => {
      const program = {};
      programs.push(program);
      return program;
    }),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    useProgram: vi.fn(),
    deleteProgram: vi.fn(),

    getAttribLocation: vi.fn((_, name) => {
      if (name === 'a_position') return 0;
      if (name === 'a_texCoord') return 1;
      return -1;
    }),
    getUniformLocation: vi.fn((_, name) => ({ name })),

    createBuffer: vi.fn(() => {
      const buffer = {};
      buffers.push(buffer);
      return buffer;
    }),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    deleteBuffer: vi.fn(),

    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),

    createTexture: vi.fn(() => {
      const texture = {};
      textures.push(texture);
      return texture;
    }),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texImage3D: vi.fn(),
    texParameteri: vi.fn(),
    deleteTexture: vi.fn(),
    activeTexture: vi.fn(),

    createFramebuffer: vi.fn(() => ({})),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 36053), // FRAMEBUFFER_COMPLETE
    deleteFramebuffer: vi.fn(),

    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3fv: vi.fn(),

    viewport: vi.fn(),
    drawArrays: vi.fn(),
    readPixels: vi.fn((_x, _y, _width, _height, _format, _type, pixels) => {
      // Fill with a pattern to verify processing happened
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = 128;     // R
        pixels[i + 1] = 128; // G
        pixels[i + 2] = 128; // B
        pixels[i + 3] = 255; // A
      }
    }),
  };
}

// Create a mock LUT3D
function createMockLUT(): LUT3D {
  return {
    size: 2,
    data: new Float32Array(2 * 2 * 2 * 3).fill(0.5),
    title: 'Test LUT',
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
  };
}

describe('WebGLLUTProcessor', () => {
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
    disposeSharedLUTProcessor();
  });

  describe('constructor', () => {
    it('WLUT-001: creates WebGL2 context with correct options', () => {
      new WebGLLUTProcessor();

      expect(mockCanvas.getContext).toHaveBeenCalledWith('webgl2', {
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
      });
    });

    it('WLUT-002: throws error when WebGL2 is not supported', () => {
      mockCanvas.getContext = vi.fn(() => null);

      expect(() => new WebGLLUTProcessor()).toThrow('WebGL2 not supported');
    });
  });

  describe('setLUT', () => {
    it('WLUT-003: sets LUT and creates texture', () => {
      const processor = new WebGLLUTProcessor();
      const lut = createMockLUT();

      processor.setLUT(lut);

      expect(processor.hasLUT()).toBe(true);
      expect(processor.getLUT()).toBe(lut);
    });

    it('WLUT-004: clears LUT when set to null', () => {
      const processor = new WebGLLUTProcessor();
      processor.setLUT(createMockLUT());
      processor.setLUT(null);

      expect(processor.hasLUT()).toBe(false);
      expect(processor.getLUT()).toBe(null);
    });
  });

  describe('apply', () => {
    it('WLUT-005: returns original imageData when no LUT is loaded', () => {
      const processor = new WebGLLUTProcessor();
      const imageData = new ImageData(10, 10);

      const result = processor.apply(imageData, 1.0);

      expect(result).toBe(imageData);
    });

    it('WLUT-006: processes imageData when LUT is loaded', () => {
      const processor = new WebGLLUTProcessor();
      processor.setLUT(createMockLUT());
      const imageData = new ImageData(10, 10);

      const result = processor.apply(imageData, 1.0);

      expect(result).not.toBe(imageData);
      expect(mockGl.drawArrays).toHaveBeenCalled();
    });

    it('WLUT-007: sets correct uniform values', () => {
      const processor = new WebGLLUTProcessor();
      const lut = createMockLUT();
      processor.setLUT(lut);
      const imageData = new ImageData(100, 100);

      processor.apply(imageData, 0.75);

      expect(mockGl.uniform1f).toHaveBeenCalledWith(expect.anything(), 0.75);
      expect(mockGl.uniform1f).toHaveBeenCalledWith(expect.anything(), 2); // LUT size
    });
  });

  describe('dispose', () => {
    it('WLUT-008: cleans up WebGL resources', () => {
      const processor = new WebGLLUTProcessor();
      processor.setLUT(createMockLUT());
      processor.dispose();

      expect(mockGl.deleteProgram).toHaveBeenCalled();
      expect(mockGl.deleteBuffer).toHaveBeenCalledTimes(2);
    });
  });

  describe('singleton functions', () => {
    it('WLUT-009: getSharedLUTProcessor returns same instance', () => {
      const processor1 = getSharedLUTProcessor();
      const processor2 = getSharedLUTProcessor();

      expect(processor1).toBe(processor2);
    });

    it('WLUT-010: disposeSharedLUTProcessor disposes and clears singleton', () => {
      const processor1 = getSharedLUTProcessor();
      disposeSharedLUTProcessor();
      const processor2 = getSharedLUTProcessor();

      expect(processor1).not.toBe(processor2);
    });
  });

  describe('texture parameter caching', () => {
    it('WLUT-012: texParameteri is called on first apply', () => {
      const processor = new WebGLLUTProcessor();
      processor.setLUT(createMockLUT());
      const imageData = new ImageData(10, 10);

      processor.apply(imageData, 1.0);

      // texParameteri should have been called for both output texture and image texture
      const texParamCalls = mockGl.texParameteri.mock.calls;
      const minFilterCalls = texParamCalls.filter(
        (call: number[]) => call[1] === mockGl.TEXTURE_MIN_FILTER
      );
      expect(minFilterCalls.length).toBeGreaterThan(0);
    });

    it('WLUT-013: texParameteri is skipped on subsequent apply with same dimensions', () => {
      const processor = new WebGLLUTProcessor();
      processor.setLUT(createMockLUT());

      const imageData1 = new ImageData(10, 10);
      processor.apply(imageData1, 1.0);

      // Clear call count after first apply
      mockGl.texParameteri.mockClear();

      const imageData2 = new ImageData(10, 10);
      processor.apply(imageData2, 1.0);

      // texParameteri should NOT be called again for image texture (same dimensions)
      // (output texture params are set in the resize block which also doesn't fire)
      const texParamCalls = mockGl.texParameteri.mock.calls;
      // Filter for TEXTURE_2D image texture param calls (not output texture which is in resize block)
      expect(texParamCalls.length).toBe(0);
    });

    it('WLUT-014: texParameteri is called again when dimensions change', () => {
      const processor = new WebGLLUTProcessor();
      processor.setLUT(createMockLUT());

      const imageData1 = new ImageData(10, 10);
      processor.apply(imageData1, 1.0);

      mockGl.texParameteri.mockClear();

      // Different dimensions
      const imageData2 = new ImageData(20, 20);
      processor.apply(imageData2, 1.0);

      // texParameteri should be called for new dimensions
      const texParamCalls = mockGl.texParameteri.mock.calls;
      expect(texParamCalls.length).toBeGreaterThan(0);
    });

    it('WLUT-015: filter mode is tracked between apply and applyFloat', () => {
      const processor = new WebGLLUTProcessor();
      processor.setLUT(createMockLUT());

      // apply() uses LINEAR
      const imageData = new ImageData(10, 10);
      processor.apply(imageData, 1.0);

      mockGl.texParameteri.mockClear();

      // applyFloat() uses NEAREST - should set params even with same dimensions
      const floatData = new Float32Array(10 * 10 * 4);
      processor.applyFloat(floatData, 10, 10, 1.0);

      // Since applyFloat uses NEAREST vs LINEAR, texParameteri must be called
      const texParamCalls = mockGl.texParameteri.mock.calls;
      const nearestCalls = texParamCalls.filter(
        (call: number[]) => call[1] === mockGl.TEXTURE_MIN_FILTER && call[2] === mockGl.NEAREST
      );
      expect(nearestCalls.length).toBeGreaterThan(0);
    });

    it('WLUT-016: switching back from applyFloat to apply resets filter mode', () => {
      const processor = new WebGLLUTProcessor();
      processor.setLUT(createMockLUT());

      // apply (LINEAR) → applyFloat (NEAREST) → apply (LINEAR)
      const imageData = new ImageData(10, 10);
      processor.apply(imageData, 1.0);

      const floatData = new Float32Array(10 * 10 * 4);
      processor.applyFloat(floatData, 10, 10, 1.0);

      mockGl.texParameteri.mockClear();

      // apply again - should re-set LINEAR since last was NEAREST
      processor.apply(imageData, 1.0);

      const texParamCalls = mockGl.texParameteri.mock.calls;
      const linearCalls = texParamCalls.filter(
        (call: number[]) => call[1] === mockGl.TEXTURE_MIN_FILTER && call[2] === mockGl.LINEAR
      );
      expect(linearCalls.length).toBeGreaterThan(0);
    });
  });

  describe('image orientation', () => {
    it('WLUT-011: preserves vertical orientation (top row stays at top)', () => {
      // Create a mock that returns a vertically asymmetric pattern
      let capturedImageData: ImageData | null = null;

      mockGl.texImage2D = vi.fn((_target, _level, _internalformat, _format, _type, imageData) => {
        if (imageData instanceof ImageData) {
          capturedImageData = imageData;
        }
      });

      mockGl.readPixels = vi.fn((_x, _y, _width, _height, _format, _type, pixels) => {
        // Simulate WebGL: copy the input data to output
        if (capturedImageData) {
          for (let i = 0; i < pixels.length && i < capturedImageData.data.length; i++) {
            pixels[i] = capturedImageData.data[i];
          }
        }
      });

      const processor = new WebGLLUTProcessor();
      processor.setLUT(createMockLUT());

      // Create 2x2 test image with distinct top and bottom rows
      // Top row (y=0): red pixels
      // Bottom row (y=1): blue pixels
      const imageData = new ImageData(2, 2);
      // Top-left (0,0): Red
      imageData.data[0] = 255; imageData.data[1] = 0; imageData.data[2] = 0; imageData.data[3] = 255;
      // Top-right (1,0): Red
      imageData.data[4] = 255; imageData.data[5] = 0; imageData.data[6] = 0; imageData.data[7] = 255;
      // Bottom-left (0,1): Blue
      imageData.data[8] = 0; imageData.data[9] = 0; imageData.data[10] = 255; imageData.data[11] = 255;
      // Bottom-right (1,1): Blue
      imageData.data[12] = 0; imageData.data[13] = 0; imageData.data[14] = 255; imageData.data[15] = 255;

      const result = processor.apply(imageData, 1.0);

      // Verify top row is still red (not flipped)
      expect(result.data[0]).toBe(255);  // R at top-left
      expect(result.data[2]).toBe(0);    // B at top-left

      // Verify bottom row is still blue (not flipped)
      expect(result.data[8]).toBe(0);    // R at bottom-left
      expect(result.data[10]).toBe(255); // B at bottom-left
    });
  });
});
