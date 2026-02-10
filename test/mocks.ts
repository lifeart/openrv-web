/**
 * Shared mock factory functions for tests.
 *
 * These helpers were extracted from multiple test files to reduce duplication.
 * Each factory creates a fresh mock on every call so tests remain isolated.
 */

import { vi } from 'vitest';
import type { Renderer } from '../src/render/Renderer';
import type { MediaSource } from '../src/core/session/Session';

// ---------------------------------------------------------------------------
// WebGL2 – Renderer-style mock
// ---------------------------------------------------------------------------

export interface MockRendererGLOptions {
  /** When true the mock accepts 'display-p3' for drawingBufferColorSpace. */
  supportP3?: boolean;
  /** When true the mock accepts 'rec2100-hlg' for drawingBufferColorSpace. */
  supportHLG?: boolean;
  /** When true the mock accepts 'rec2100-pq' for drawingBufferColorSpace. */
  supportPQ?: boolean;
  /** When true the mock provides drawingBufferStorage() method. */
  supportDrawingBufferStorage?: boolean;
}

/**
 * Create a mock WebGL2RenderingContext suitable for Renderer / WebGL2Backend tests.
 *
 * Supports optional HDR color-space emulation controlled via `opts`.
 *
 * Used by: Renderer.test.ts, RendererBackend.test.ts, hdr-acceptance-criteria.test.ts
 */
export function createMockRendererGL(
  opts: MockRendererGLOptions = {},
): WebGL2RenderingContext {
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
    drawingBufferStorage: opts.supportDrawingBufferStorage ? vi.fn() : undefined,
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
    RGBA16F: 0x881a,
  } as unknown as WebGL2RenderingContext;

  return gl;
}

/**
 * Initialize a Renderer with a mocked WebGL context.
 *
 * Creates a canvas whose `getContext('webgl2')` returns a mock GL context,
 * then calls `renderer.initialize(canvas)`.
 *
 * Used by: RendererBackend.test.ts, hdr-acceptance-criteria.test.ts
 */
export interface InitRendererWithMockGLOptions {
  /** Options for the mock GL context */
  gl?: MockRendererGLOptions;
  /** When true, attaches configureHighDynamicRange() to the canvas */
  canvasExtendedHDR?: boolean;
  /** DisplayCapabilities to pass to initialize() */
  capabilities?: import('../src/color/DisplayCapabilities').DisplayCapabilities;
}

export function initRendererWithMockGL(
  renderer: Renderer,
  glOpts: MockRendererGLOptions = {},
  extraOpts?: Omit<InitRendererWithMockGLOptions, 'gl'>,
): WebGL2RenderingContext {
  const mockGL = createMockRendererGL(glOpts);
  const canvas = document.createElement('canvas');

  const originalGetContext = canvas.getContext.bind(canvas);
  canvas.getContext = vi.fn((contextId: string, _options?: unknown) => {
    if (contextId === 'webgl2') return mockGL;
    return originalGetContext(contextId, _options as CanvasRenderingContext2DSettings);
  }) as typeof canvas.getContext;

  if (extraOpts?.canvasExtendedHDR) {
    (canvas as unknown as { configureHighDynamicRange: (opts: unknown) => void }).configureHighDynamicRange = vi.fn();
  }

  renderer.initialize(canvas, extraOpts?.capabilities);
  return mockGL;
}

// ---------------------------------------------------------------------------
// WebGL2 – WebGL-processor-style mock (with resource tracking)
// ---------------------------------------------------------------------------

/**
 * Create a mock WebGL2RenderingContext with internal resource-tracking arrays
 * suitable for testing WebGL processors (sharpen, LUT, scopes, etc.).
 *
 * This mock tracks created textures, buffers, programs, and shaders in arrays
 * so tests can assert resource cleanup.
 *
 * Used by: WebGLSharpen.test.ts, WebGLLUT.test.ts (WebGLScopes.test.ts uses
 * a simpler variant and is intentionally left local)
 */
export function createMockWebGL2Context() {
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
    HALF_FLOAT: 0x140b,
    RGBA32F: 0x8814,
    RGBA16F: 0x881a,
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

    getAttribLocation: vi.fn((_: unknown, name: string) => {
      if (name === 'a_position') return 0;
      if (name === 'a_texCoord') return 1;
      return -1;
    }),
    getUniformLocation: vi.fn((_: unknown, name: string) => ({ name })),

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
    readPixels: vi.fn(
      (
        _x: number,
        _y: number,
        _width: number,
        _height: number,
        _format: number,
        _type: number,
        pixels: Uint8Array,
      ) => {
        // Fill with a pattern to verify processing happened
        for (let i = 0; i < pixels.length; i += 4) {
          pixels[i] = 128; // R
          pixels[i + 1] = 128; // G
          pixels[i + 2] = 128; // B
          pixels[i + 3] = 255; // A
        }
      },
    ),
  };
}

// ---------------------------------------------------------------------------
// DOM element mocks – Image / Video / MediaSource
// ---------------------------------------------------------------------------

/**
 * Create a mock HTMLImageElement with the given natural dimensions.
 *
 * Uses real DOM `document.createElement('img')` and configurable property
 * descriptors so that `naturalWidth` / `naturalHeight` report correct values.
 *
 * Used by: ViewerExport.test.ts, ViewerRenderingUtils.test.ts,
 *          ViewerPrerender.test.ts, ViewerIntegration.test.ts
 */
export function createMockImage(
  width: number,
  height: number,
): HTMLImageElement {
  const img = document.createElement('img');
  Object.defineProperty(img, 'naturalWidth', {
    value: width,
    configurable: true,
  });
  Object.defineProperty(img, 'naturalHeight', {
    value: height,
    configurable: true,
  });
  Object.defineProperty(img, 'width', {
    value: width,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(img, 'height', {
    value: height,
    configurable: true,
    writable: true,
  });
  return img;
}

/**
 * Create a mock HTMLVideoElement with the given video dimensions.
 *
 * Uses real DOM `document.createElement('video')` with writable
 * `videoWidth` / `videoHeight` properties.
 *
 * Used by: ViewerExport.test.ts, ViewerRenderingUtils.test.ts,
 *          ViewerIntegration.test.ts
 */
export function createMockVideo(
  width: number,
  height: number,
): HTMLVideoElement {
  const video = document.createElement('video');
  Object.defineProperty(video, 'videoWidth', {
    value: width,
    writable: true,
  });
  Object.defineProperty(video, 'videoHeight', {
    value: height,
    writable: true,
  });
  // Simulate currentTime setter dispatching a 'seeked' event
  // so that tests waiting for video.addEventListener('seeked', ...) resolve.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (video as any)._currentTime = 0;
  Object.defineProperty(video, 'currentTime', {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get: () => (video as any)._currentTime,
    set: (v: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (video as any)._currentTime = v;
      setTimeout(() => video.dispatchEvent(new Event('seeked')), 0);
    },
  });
  return video;
}

/**
 * Create a mock `MediaSource` (the session-level source descriptor).
 *
 * Builds an image- or video-backed source with sensible defaults.
 * Sequence sources include a `sequenceInfo` block.
 *
 * Used by: ViewerExport.test.ts, ViewerPrerender.test.ts
 */
export function createMockMediaSource(
  type: 'image' | 'video' | 'sequence',
  width: number,
  height: number,
): MediaSource {
  let element: HTMLImageElement | HTMLVideoElement;
  if (type === 'video') {
    element = createMockVideo(width, height);
  } else {
    element = createMockImage(width, height);
  }

  return {
    name: 'test-source',
    type,
    url: 'test://test-source',
    element,
    width,
    height,
    duration: type === 'video' ? 100 : 1,
    fps: 24,
    sequenceInfo:
      type === 'sequence'
        ? {
            name: 'test-sequence',
            pattern: 'frame_####.png',
            frames: [],
            startFrame: 1,
            endFrame: 100,
            width,
            height,
            fps: 24,
            missingFrames: [],
          }
        : undefined,
  };
}
