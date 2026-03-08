/**
 * Shared mock factory functions for tests.
 *
 * These helpers were extracted from multiple test files to reduce duplication.
 * Each factory creates a fresh mock on every call so tests remain isolated.
 */

import { vi } from 'vitest';
import type { Renderer } from '../src/render/Renderer';
import type { MediaSource } from '../src/core/session/Session';
import type { SessionBridgeContext } from '../src/AppSessionBridge';
import type { PlaybackEngineHost } from '../src/core/session/PlaybackEngine';
import type { GTOComponentDTO } from '../src/core/session/SessionTypes';

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
    getExtension: vi.fn((name: string) => {
      if (name === 'KHR_parallel_shader_compile') return {};
      return null;
    }),
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
    getUniformLocation: vi.fn((_program: unknown, name: string) => ({ __uniformName: name })),
    getAttribLocation: vi.fn(() => 0),
    useProgram: vi.fn(),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    uniform4fv: vi.fn(),
    uniform1iv: vi.fn(),
    uniform2iv: vi.fn(),
    uniform3iv: vi.fn(),
    uniform4iv: vi.fn(),
    uniformMatrix2fv: vi.fn(),
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
    generateMipmap: vi.fn(),
    getParameter: vi.fn((pname: number) => {
      if (pname === 0x0ba2 /* VIEWPORT */) return new Int32Array([0, 0, 800, 600]);
      return null;
    }),
    enable: vi.fn(),
    disable: vi.fn(),
    scissor: vi.fn(),
    isContextLost: vi.fn(() => false),
    // Constants
    VIEWPORT: 0x0ba2,
    SCISSOR_TEST: 0x0c11,
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
    REPEAT: 0x2901,
    LINEAR: 0x2601,
    NEAREST: 0x2600,
    LINEAR_MIPMAP_LINEAR: 0x2703,
    RGBA8: 0x8058,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    RGBA16F: 0x881a,
    RGBA32F: 0x8814,
    TEXTURE_3D: 0x806f,
    TEXTURE_WRAP_R: 0x8072,
    TEXTURE3: 0x84c3,
    COMPLETION_STATUS_KHR: 0x91B1,
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

/**
 * Extract the last value set for a specific uniform via `gl.uniform1i`.
 *
 * Works with mock GL contexts created by `createMockRendererGL`, which tags
 * each uniform location object with `__uniformName`. Scans the recorded
 * `uniform1i` calls in reverse to find the most recent call for the given
 * uniform name.
 *
 * Returns `undefined` if the uniform was never set.
 */
export function getLastUniform1i(
  mockGL: WebGL2RenderingContext,
  uniformName: string,
): number | undefined {
  const mock = mockGL.uniform1i as unknown as ReturnType<typeof vi.fn>;
  const calls = mock.mock.calls as Array<[{ __uniformName?: string }, number]>;
  for (let i = calls.length - 1; i >= 0; i--) {
    const call = calls[i]!;
    if (call[0]?.__uniformName === uniformName) {
      return call[1];
    }
  }
  return undefined;
}

/**
 * Extract the last value set for a specific uniform via `gl.uniform1f`.
 *
 * Same approach as `getLastUniform1i` but for float uniforms.
 */
export function getLastUniform1f(
  mockGL: WebGL2RenderingContext,
  uniformName: string,
): number | undefined {
  const mock = mockGL.uniform1f as unknown as ReturnType<typeof vi.fn>;
  const calls = mock.mock.calls as Array<[{ __uniformName?: string }, number]>;
  for (let i = calls.length - 1; i >= 0; i--) {
    const call = calls[i]!;
    if (call[0]?.__uniformName === uniformName) {
      return call[1];
    }
  }
  return undefined;
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
    REPEAT: 10497,
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
    COMPLETION_STATUS_KHR: 0x91B1,

    getExtension: vi.fn((name: string) => {
      if (name === 'EXT_color_buffer_float') return {};
      if (name === 'OES_texture_float_linear') return {};
      if (name === 'KHR_parallel_shader_compile') return {};
      return null;
    }),
    getError: vi.fn(() => 0),

    createShader: vi.fn((_type: number) => {
      const shader = {};
      shaders.push(shader);
      return shader;
    }),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn((_shader: unknown, _pname: number) => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),

    createProgram: vi.fn(() => {
      const program = {};
      programs.push(program);
      return program;
    }),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn((_program: unknown, _pname: number) => true),
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
    uniform1fv: vi.fn(),
    uniform2f: vi.fn(),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    uniformMatrix2fv: vi.fn(),
    uniformMatrix4fv: vi.fn(),

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
   
  (video as any)._currentTime = 0;
  Object.defineProperty(video, 'currentTime', {
     
    get: () => (video as any)._currentTime,
    set: (v: number) => {
       
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

// ---------------------------------------------------------------------------
// Session mock
// ---------------------------------------------------------------------------

/**
 * Create a mock Session object with sensible defaults.
 *
 * Covers the superset of properties needed by FrameNavigationService,
 * KeyboardActionMap, AppPlaybackWiring, RenderLoopService, SessionURLService,
 * and persistence handler tests.
 *
 * Every method is a `vi.fn()` stub. Pass `overrides` to replace any default.
 *
 * Used by: FrameNavigationService.test.ts, FrameNavigationService.rangeShift.test.ts,
 *          KeyboardActionMap.test.ts, RenderLoopService.test.ts, SessionURLService.test.ts
 */
export function createMockSession(overrides?: Record<string, unknown>) {
  return {
    // State
    currentFrame: 1,
    currentSourceIndex: 0,
    inPoint: 1,
    outPoint: 100,
    frameCount: 100,
    fps: 24,
    loopMode: 'loop' as 'once' | 'loop' | 'pingpong',
    playDirection: 1,
    isPlaying: false,
    volume: 1,
    muted: false,
    currentSource: { duration: 100, width: 1920, height: 1080 } as Record<string, unknown> | null,
    currentAB: 'A' as 'A' | 'B',
    sourceAIndex: 0,
    sourceBIndex: -1,
    sourceCount: 2,
    marks: new Map<number, { frame: number; endFrame?: number }>(),
    metadata: { displayName: 'Test Session' },
    isSingleImage: false,

    // Navigation
    goToFrame: vi.fn(),
    goToStart: vi.fn(),
    goToEnd: vi.fn(),
    stepForward: vi.fn(),
    stepBackward: vi.fn(),
    setCurrentSource: vi.fn(),
    setInPoint: vi.fn(),
    setOutPoint: vi.fn(),
    setInOutRange: vi.fn(),
    resetInOutPoints: vi.fn(),
    emitRangeShifted: vi.fn(),

    // Markers
    goToNextMarker: vi.fn().mockReturnValue(null),
    goToPreviousMarker: vi.fn().mockReturnValue(null),
    toggleMark: vi.fn(),

    // Playback
    togglePlayback: vi.fn(),
    togglePlayDirection: vi.fn(),
    togglePlaybackMode: vi.fn(),
    pause: vi.fn(),
    decreaseSpeed: vi.fn(),
    increaseSpeed: vi.fn(),
    update: vi.fn(),

    // A/B compare
    toggleAB: vi.fn(),
    setCurrentAB: vi.fn(),
    setSourceA: vi.fn(),
    setSourceB: vi.fn(),

    // Audio
    toggleMute: vi.fn(),

    // Notes
    noteManager: {
      getNextNoteFrame: vi.fn().mockReturnValue(20),
      getPreviousNoteFrame: vi.fn().mockReturnValue(5),
    },

    // Apply overrides
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Viewer mock
// ---------------------------------------------------------------------------

/**
 * Create a mock Viewer object with sensible defaults.
 *
 * Covers the superset of viewer methods needed by KeyboardActionMap,
 * AppViewWiring, AppPlaybackWiring, RenderLoopService, and SessionURLService tests.
 *
 * Every method is a `vi.fn()` stub. Pass `overrides` to replace any default.
 *
 * Used by: KeyboardActionMap.test.ts, AppViewWiring.test.ts,
 *          RenderLoopService.test.ts, SessionURLService.test.ts,
 *          AppPlaybackWiring.test.ts
 */
export function createMockViewer(overrides?: Record<string, unknown>) {
  return {
    // Zoom / fit
    smoothFitToWindow: vi.fn(),
    smoothFitToWidth: vi.fn(),
    smoothFitToHeight: vi.fn(),
    smoothSetZoom: vi.fn(),
    smoothSetPixelRatio: vi.fn(),

    // Rendering
    refresh: vi.fn(),
    renderDirect: vi.fn(),
    renderFrameToCanvas: vi.fn(),
    resize: vi.fn(),

    // Export
    exportFrame: vi.fn(),
    exportSourceFrame: vi.fn(),
    copyFrameToClipboard: vi.fn(),

    // State setters
    setWipeState: vi.fn(),
    setDifferenceMatteState: vi.fn(),
    setBlendModeState: vi.fn(),
    setToneMappingState: vi.fn(),
    setHDROutputMode: vi.fn(),
    setGhostFrameState: vi.fn(),
    setPARState: vi.fn(),
    setBackgroundPatternState: vi.fn(),
    setChannelMode: vi.fn(),
    setStereoState: vi.fn(),
    setStereoEyeTransforms: vi.fn(),
    setStereoAlignMode: vi.fn(),
    resetStereoEyeTransforms: vi.fn(),
    resetStereoAlignMode: vi.fn(),
    setTransform: vi.fn(),
    setNoiseReductionParams: vi.fn(),
    setColorAdjustments: vi.fn(),
    initPrerenderBuffer: vi.fn(),
    updatePrerenderPlaybackState: vi.fn(),
    toggleFilterMode: vi.fn(),

    // Getters
    getContainer: vi.fn(() => document.createElement('div')),
    getElement: vi.fn(() => document.createElement('div')),
    getImageData: vi.fn().mockReturnValue({
      width: 100,
      height: 100,
      data: new Uint8ClampedArray(100 * 100 * 4),
    }),
    getScopeImageData: vi.fn(() => null),
    getStereoState: vi.fn(() => ({ mode: 'off' })),
    getStereoPair: vi.fn(() => null),
    getTransform: vi.fn().mockReturnValue({
      x: 0, y: 0, zoom: 1, rotation: 0,
      flipH: false, flipV: false,
    }),
    getGLRenderer: vi.fn(() => null),
    isDisplayHDRCapable: vi.fn(() => false),
    onCursorColorChange: vi.fn(),
    getMatteOverlay: vi.fn(() => ({ setSettings: vi.fn() })),
    getEXRWindowOverlay: vi.fn(() => ({ setWindows: vi.fn(), clearWindows: vi.fn() })),

    // Overlays / tools
    getPixelProbe: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getFalseColor: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getTimecodeOverlay: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getInfoStripOverlay: vi.fn().mockReturnValue({
      toggle: vi.fn(),
      togglePathMode: vi.fn(),
    }),
    getFPSIndicator: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getZebraStripes: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getColorWheels: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getSpotlightOverlay: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getHSLQualifier: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getLuminanceVisualization: vi.fn().mockReturnValue({ cycleMode: vi.fn() }),

    // Apply overrides
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Audio mocks
// ---------------------------------------------------------------------------

/**
 * Create a mock AudioParam with scheduling methods.
 *
 * Used by: AudioPlaybackManager.test.ts, AudioMixer.test.ts
 */
export function createMockAudioParam(initialValue = 1) {
  return {
    value: initialValue,
    setValueAtTime: vi.fn(),
    setValueCurveAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

/**
 * Create a mock GainNode.
 *
 * Used by: AudioPlaybackManager.test.ts, AudioMixer.test.ts
 */
export function createMockGainNode() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: createMockAudioParam(1),
  };
}

/**
 * Create a mock AudioBufferSourceNode.
 *
 * Used by: AudioPlaybackManager.test.ts
 */
export function createMockSourceNode() {
  return {
    buffer: null as AudioBuffer | null,
    playbackRate: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };
}

/**
 * Create a mock AudioContext with gain/source factories and tracking arrays.
 *
 * Returns the context plus helper arrays for tracking created nodes.
 *
 * Used by: AudioPlaybackManager.test.ts
 */
export function createMockAudioContext(overrides?: Record<string, unknown>) {
  const createdGainNodes: ReturnType<typeof createMockGainNode>[] = [];
  const createdSourceNodes: ReturnType<typeof createMockSourceNode>[] = [];

  const mockAudioBuffer = {
    duration: 10,
    sampleRate: 44100,
    numberOfChannels: 2,
    length: 441000,
    getChannelData: vi.fn().mockReturnValue(new Float32Array(441000)),
  };

  const ctx = {
    state: 'running' as AudioContextState,
    currentTime: 0,
    createGain: vi.fn(() => {
      const node = createMockGainNode();
      createdGainNodes.push(node);
      return node;
    }),
    createBufferSource: vi.fn(() => {
      const node = createMockSourceNode();
      createdSourceNodes.push(node);
      return node;
    }),
    decodeAudioData: vi.fn().mockResolvedValue(mockAudioBuffer),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    destination: {},
    ...overrides,
  };

  return {
    context: ctx,
    createdGainNodes,
    createdSourceNodes,
    mockAudioBuffer,
  };
}

// ---------------------------------------------------------------------------
// SessionBridgeContext mock
// ---------------------------------------------------------------------------

/**
 * Create a mock SessionBridgeContext with all getter methods returning
 * mock objects with vi.fn() stubs.
 *
 * This is the comprehensive version used by persistenceHandlers.test.ts.
 * Each getter returns a fresh mock object. Pass `overrides` to replace
 * any specific getter return value.
 *
 * Used by: persistenceHandlers.test.ts, scopeHandlers.test.ts,
 *          sourceLoadedHandlers.test.ts, compareHandlers.test.ts,
 *          playbackHandlers.test.ts, infoPanelHandlers.test.ts
 */
export function createMockSessionBridgeContext(overrides?: Record<string, unknown>): SessionBridgeContext {
  const paintEngine = {
    loadFromAnnotations: vi.fn(),
    setGhostMode: vi.fn(),
    setHoldMode: vi.fn(),
  };
  const persistenceManager = {
    syncGTOStore: vi.fn(),
    setGTOStore: vi.fn(),
  };
  const matteOverlay = { setSettings: vi.fn() };
  const viewer = {
    getMatteOverlay: () => matteOverlay,
    setTransform: vi.fn(),
    setNoiseReductionParams: vi.fn(),
    initPrerenderBuffer: vi.fn(),
    refresh: vi.fn(),
    getGLRenderer: vi.fn(() => null),
    isDisplayHDRCapable: vi.fn(() => false),
    getImageData: vi.fn(() => null),
    getScopeImageData: vi.fn(() => null),
    getEXRWindowOverlay: vi.fn(() => ({ setWindows: vi.fn(), clearWindows: vi.fn() })),
    updatePrerenderPlaybackState: vi.fn(),
  };
  const colorControls = { setAdjustments: vi.fn(), getAdjustments: vi.fn(() => ({})) };
  const filterControl = { setSettings: vi.fn() };
  const noiseReductionControl = { setParams: vi.fn() };
  const cdlControl = { setCDL: vi.fn() };
  const transformControl = { setTransform: vi.fn() };
  const lensControl = { setParams: vi.fn() };
  const cropControl = {
    setState: vi.fn(),
    setUncropState: vi.fn(),
    setSourceDimensions: vi.fn(),
  };
  const channelSelect = {
    setChannel: vi.fn(),
    clearEXRLayers: vi.fn(),
    setEXRLayers: vi.fn(),
  };
  const stereoControl = { setState: vi.fn() };
  const stereoEyeTransformControl = { setState: vi.fn() };
  const stereoAlignControl = { setMode: vi.fn() };
  const scopesControl = { setScopeVisible: vi.fn() };
  const histogram = {
    show: vi.fn(),
    hide: vi.fn(),
    isVisible: vi.fn(() => false),
    update: vi.fn(),
    updateHDR: vi.fn(),
    isHDRActive: vi.fn(() => false),
    calculate: vi.fn(() => null),
    calculateHDR: vi.fn(() => null),
    getData: vi.fn(() => null),
    setPlaybackMode: vi.fn(),
    setHDRMode: vi.fn(),
    setHDRAutoFit: vi.fn(),
  };
  const waveform = {
    show: vi.fn(),
    hide: vi.fn(),
    isVisible: vi.fn(() => false),
    update: vi.fn(),
    updateFloat: vi.fn(),
    setPlaybackMode: vi.fn(),
  };
  const vectorscope = {
    show: vi.fn(),
    hide: vi.fn(),
    isVisible: vi.fn(() => false),
    update: vi.fn(),
    updateFloat: vi.fn(),
    setPlaybackMode: vi.fn(),
  };
  const gamutDiagram = {
    show: vi.fn(),
    hide: vi.fn(),
    isVisible: vi.fn(() => false),
    update: vi.fn(),
    updateFloat: vi.fn(),
  };
  const compareControl = {
    setABAvailable: vi.fn(),
    setABSource: vi.fn(),
  };
  const infoPanel = { update: vi.fn() };
  const ocioProcessor = {
    setActiveSource: vi.fn(),
    detectColorSpaceFromExtension: vi.fn(() => null),
    setSourceInputColorSpace: vi.fn(),
    getSourceInputColorSpace: vi.fn(() => null),
  };
  const ocioControl = { getProcessor: () => ocioProcessor };
  const toneMappingControl = {
    setState: vi.fn(),
    getState: vi.fn(() => ({ enabled: false, operator: 'off' })),
  };
  const stackControl = { setAvailableSources: vi.fn() };
  const session = {
    currentSource: { width: 1920, height: 1080 },
    gtoData: null,
    allSources: [],
    currentSourceIndex: 0,
    playDirection: 1,
  };

  const result = {
    getSession: () => session,
    getPaintEngine: () => paintEngine,
    getPersistenceManager: () => persistenceManager,
    getViewer: () => viewer,
    getColorControls: () => colorControls,
    getFilterControl: () => filterControl,
    getNoiseReductionControl: () => noiseReductionControl,
    getCDLControl: () => cdlControl,
    getTransformControl: () => transformControl,
    getLensControl: () => lensControl,
    getCropControl: () => cropControl,
    getChannelSelect: () => channelSelect,
    getStereoControl: () => stereoControl,
    getStereoEyeTransformControl: () => stereoEyeTransformControl,
    getStereoAlignControl: () => stereoAlignControl,
    getScopesControl: () => scopesControl,
    getHistogram: () => histogram,
    getWaveform: () => waveform,
    getVectorscope: () => vectorscope,
    getGamutDiagram: () => gamutDiagram,
    getCompareControl: () => compareControl,
    getInfoPanel: () => infoPanel,
    getOCIOControl: () => ocioControl,
    getToneMappingControl: () => toneMappingControl,
    getStackControl: () => stackControl,
    ...overrides,
  } as unknown as SessionBridgeContext;

  return result;
}

// ---------------------------------------------------------------------------
// PlaybackEngineHost mock
// ---------------------------------------------------------------------------

/**
 * Create a mock PlaybackEngineHost with vi.fn() stubs.
 *
 * Used by: PlaybackEngine.test.ts, PlaybackEngine.setInOutRange.test.ts
 */
export function createMockPlaybackEngineHost(duration: number = 100): PlaybackEngineHost {
  return {
    getCurrentSource: vi.fn().mockReturnValue({ duration, type: 'image' }),
    getSourceB: vi.fn().mockReturnValue(null),
    applyVolumeToVideo: vi.fn(),
    safeVideoPlay: vi.fn(),
    initVideoPreservesPitch: vi.fn(),
    getAudioSyncEnabled: vi.fn().mockReturnValue(false),
    setAudioSyncEnabled: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// GTO ComponentDTO mock
// ---------------------------------------------------------------------------

/**
 * Create a mock GTOComponentDTO whose `.property(name).value()` returns the
 * matching entry from `props`.
 *
 * Used by: AnnotationStore.test.ts
 */
export function createMockGTOComponentDTO(props: Record<string, unknown>): GTOComponentDTO {
  return {
    property(name: string) {
      return { value: () => props[name] };
    },
  };
}
