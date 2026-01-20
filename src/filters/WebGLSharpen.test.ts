import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WebGLSharpenProcessor,
  getSharedSharpenProcessor,
  disposeSharedSharpenProcessor,
} from './WebGLSharpen';

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
    TEXTURE0: 33984,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    LINEAR: 9729,
    CLAMP_TO_EDGE: 33071,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    FRAMEBUFFER: 36160,
    TRIANGLE_STRIP: 5,

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
    texParameteri: vi.fn(),
    deleteTexture: vi.fn(),
    activeTexture: vi.fn(),

    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),

    viewport: vi.fn(),
    bindFramebuffer: vi.fn(),
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

describe('WebGLSharpenProcessor', () => {
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
    disposeSharedSharpenProcessor();
  });

  describe('constructor', () => {
    it('WGS-001: creates WebGL2 context with correct options', () => {
      new WebGLSharpenProcessor();

      expect(mockCanvas.getContext).toHaveBeenCalledWith('webgl2', {
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
      });
    });

    it('WGS-002: throws error when WebGL2 is not supported', () => {
      mockCanvas.getContext = vi.fn(() => null);

      expect(() => new WebGLSharpenProcessor()).toThrow('WebGL2 not supported');
    });

    it('WGS-003: initializes shader program', () => {
      new WebGLSharpenProcessor();

      expect(mockGl.createShader).toHaveBeenCalledTimes(2);
      expect(mockGl.createProgram).toHaveBeenCalledTimes(1);
      expect(mockGl.linkProgram).toHaveBeenCalled();
    });

    it('WGS-004: creates position and texture coordinate buffers', () => {
      new WebGLSharpenProcessor();

      expect(mockGl.createBuffer).toHaveBeenCalledTimes(2);
      expect(mockGl.bufferData).toHaveBeenCalledTimes(2);
    });
  });

  describe('isReady', () => {
    it('WGS-005: returns true when initialized successfully', () => {
      const processor = new WebGLSharpenProcessor();
      expect(processor.isReady()).toBe(true);
    });

    it('WGS-006: returns false when shader compilation fails', () => {
      mockGl.getShaderParameter = vi.fn(() => false);

      const processor = new WebGLSharpenProcessor();
      expect(processor.isReady()).toBe(false);
    });
  });

  describe('apply', () => {
    it('WGS-007: returns original imageData when amount is 0', () => {
      const processor = new WebGLSharpenProcessor();
      const imageData = new ImageData(10, 10);

      const result = processor.apply(imageData, 0);

      expect(result).toBe(imageData);
      expect(mockGl.drawArrays).not.toHaveBeenCalled();
    });

    it('WGS-008: returns original imageData when amount is negative', () => {
      const processor = new WebGLSharpenProcessor();
      const imageData = new ImageData(10, 10);

      const result = processor.apply(imageData, -10);

      expect(result).toBe(imageData);
    });

    it('WGS-009: processes imageData when amount is positive', () => {
      const processor = new WebGLSharpenProcessor();
      const imageData = new ImageData(10, 10);

      const result = processor.apply(imageData, 50);

      expect(result).not.toBe(imageData);
      expect(mockGl.drawArrays).toHaveBeenCalled();
    });

    it('WGS-010: resizes canvas to match imageData dimensions', () => {
      const processor = new WebGLSharpenProcessor();
      const imageData = new ImageData(100, 200);

      processor.apply(imageData, 50);

      expect(mockCanvas.width).toBe(100);
      expect(mockCanvas.height).toBe(200);
      expect(mockGl.viewport).toHaveBeenCalledWith(0, 0, 100, 200);
    });

    it('WGS-011: sets correct uniform values', () => {
      const processor = new WebGLSharpenProcessor();
      const imageData = new ImageData(100, 100);

      processor.apply(imageData, 50);

      expect(mockGl.uniform1i).toHaveBeenCalled(); // u_image
      expect(mockGl.uniform1f).toHaveBeenCalledWith(expect.anything(), 0.5); // u_amount = 50/100
      expect(mockGl.uniform2f).toHaveBeenCalledWith(expect.anything(), 0.01, 0.01); // u_texelSize
    });

    it('WGS-012: uploads texture with correct parameters', () => {
      const processor = new WebGLSharpenProcessor();
      const imageData = new ImageData(10, 10);

      processor.apply(imageData, 50);

      expect(mockGl.texImage2D).toHaveBeenCalled();
      expect(mockGl.texParameteri).toHaveBeenCalledWith(
        mockGl.TEXTURE_2D,
        mockGl.TEXTURE_MIN_FILTER,
        mockGl.LINEAR
      );
    });

    it('WGS-013: reads pixels back from framebuffer', () => {
      const processor = new WebGLSharpenProcessor();
      const imageData = new ImageData(10, 10);

      processor.apply(imageData, 50);

      expect(mockGl.readPixels).toHaveBeenCalled();
    });
  });

  describe('applyInPlace', () => {
    it('WGS-014: modifies imageData in place', () => {
      const processor = new WebGLSharpenProcessor();
      const imageData = new ImageData(10, 10);
      // Set initial value
      imageData.data[0] = 255;

      processor.applyInPlace(imageData, 50);

      // Should be modified by mock readPixels (sets to 128)
      expect(imageData.data[0]).toBe(128);
    });

    it('WGS-015: does nothing when amount is 0', () => {
      const processor = new WebGLSharpenProcessor();
      const imageData = new ImageData(10, 10);
      imageData.data[0] = 255;

      processor.applyInPlace(imageData, 0);

      expect(imageData.data[0]).toBe(255);
    });
  });

  describe('dispose', () => {
    it('WGS-016: cleans up WebGL resources', () => {
      const processor = new WebGLSharpenProcessor();
      processor.dispose();

      expect(mockGl.deleteProgram).toHaveBeenCalled();
      expect(mockGl.deleteBuffer).toHaveBeenCalledTimes(2);
      expect(mockGl.deleteTexture).toHaveBeenCalled();
    });

    it('WGS-017: sets isReady to false after dispose', () => {
      const processor = new WebGLSharpenProcessor();
      expect(processor.isReady()).toBe(true);

      processor.dispose();

      expect(processor.isReady()).toBe(false);
    });
  });

  describe('singleton functions', () => {
    it('WGS-018: getSharedSharpenProcessor returns same instance', () => {
      const processor1 = getSharedSharpenProcessor();
      const processor2 = getSharedSharpenProcessor();

      expect(processor1).toBe(processor2);
    });

    it('WGS-019: disposeSharedSharpenProcessor disposes and clears singleton', () => {
      const processor1 = getSharedSharpenProcessor();
      disposeSharedSharpenProcessor();
      const processor2 = getSharedSharpenProcessor();

      expect(processor1).not.toBe(processor2);
    });
  });

  describe('image orientation', () => {
    it('WGS-020: preserves vertical orientation (top row stays at top)', () => {
      // Create a mock that returns a vertically asymmetric pattern
      // Top row: red, Bottom row: blue
      let capturedImageData: ImageData | null = null;

      mockGl.texImage2D = vi.fn((_target, _level, _internalformat, _format, _type, imageData) => {
        capturedImageData = imageData as ImageData;
      });

      mockGl.readPixels = vi.fn((_x, _y, _width, _height, _format, _type, pixels) => {
        // Simulate WebGL: copy the input data to output
        // In correct implementation, no flip should occur
        if (capturedImageData) {
          for (let i = 0; i < pixels.length && i < capturedImageData.data.length; i++) {
            pixels[i] = capturedImageData.data[i];
          }
        }
      });

      const processor = new WebGLSharpenProcessor();

      // Create 2x2 test image with distinct top and bottom rows
      // Top row (y=0): red pixels
      // Bottom row (y=1): blue pixels
      const imageData = new ImageData(2, 2);
      // Top-left (0,0): Red
      imageData.data[0] = 255;   // R
      imageData.data[1] = 0;     // G
      imageData.data[2] = 0;     // B
      imageData.data[3] = 255;   // A
      // Top-right (1,0): Red
      imageData.data[4] = 255;
      imageData.data[5] = 0;
      imageData.data[6] = 0;
      imageData.data[7] = 255;
      // Bottom-left (0,1): Blue
      imageData.data[8] = 0;
      imageData.data[9] = 0;
      imageData.data[10] = 255;
      imageData.data[11] = 255;
      // Bottom-right (1,1): Blue
      imageData.data[12] = 0;
      imageData.data[13] = 0;
      imageData.data[14] = 255;
      imageData.data[15] = 255;

      const result = processor.apply(imageData, 50);

      // Verify top row is still red (not flipped)
      expect(result.data[0]).toBe(255);  // R at top-left
      expect(result.data[2]).toBe(0);    // B at top-left

      // Verify bottom row is still blue (not flipped)
      expect(result.data[8]).toBe(0);    // R at bottom-left
      expect(result.data[10]).toBe(255); // B at bottom-left
    });

    it('WGS-021: preserves orientation when using applyInPlace', () => {
      let capturedImageData: ImageData | null = null;

      mockGl.texImage2D = vi.fn((_target, _level, _internalformat, _format, _type, imageData) => {
        capturedImageData = imageData as ImageData;
      });

      mockGl.readPixels = vi.fn((_x, _y, _width, _height, _format, _type, pixels) => {
        if (capturedImageData) {
          for (let i = 0; i < pixels.length && i < capturedImageData.data.length; i++) {
            pixels[i] = capturedImageData.data[i];
          }
        }
      });

      const processor = new WebGLSharpenProcessor();

      // Create vertically asymmetric image: green at top, yellow at bottom
      const imageData = new ImageData(2, 2);
      // Top row: green
      imageData.data[0] = 0; imageData.data[1] = 255; imageData.data[2] = 0; imageData.data[3] = 255;
      imageData.data[4] = 0; imageData.data[5] = 255; imageData.data[6] = 0; imageData.data[7] = 255;
      // Bottom row: yellow
      imageData.data[8] = 255; imageData.data[9] = 255; imageData.data[10] = 0; imageData.data[11] = 255;
      imageData.data[12] = 255; imageData.data[13] = 255; imageData.data[14] = 0; imageData.data[15] = 255;

      processor.applyInPlace(imageData, 50);

      // Top row should still be green
      expect(imageData.data[0]).toBe(0);   // R at top
      expect(imageData.data[1]).toBe(255); // G at top

      // Bottom row should still be yellow
      expect(imageData.data[8]).toBe(255);  // R at bottom
      expect(imageData.data[9]).toBe(255);  // G at bottom
    });
  });
});
