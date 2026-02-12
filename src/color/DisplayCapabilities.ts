/**
 * DisplayCapabilities - Centralized display capability detection
 *
 * Probes browser APIs at startup to determine what color gamut,
 * HDR, and WebGPU features are available. All detection uses
 * throwaway canvases/contexts that are cleaned up after probing.
 *
 * Every consumer reads from the cached DisplayCapabilities object
 * rather than doing ad-hoc feature detection.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Complete display capability descriptor.
 * Probed once at startup by detectDisplayCapabilities().
 */
export interface DisplayCapabilities {
  // Wide Color Gamut
  canvasP3: boolean;          // 2D canvas supports colorSpace:'display-p3'
  webglP3: boolean;           // WebGL2 supports drawingBufferColorSpace='display-p3'
  displayGamut: 'srgb' | 'p3' | 'rec2020';

  // HDR (detected but not used in Phase 1)
  displayHDR: boolean;
  webglHLG: boolean;
  webglPQ: boolean;
  canvasHLG: boolean;
  canvasFloat16: boolean;

  // WebGPU (detected but not used in Phase 1)
  webgpuAvailable: boolean;
  webgpuHDR: boolean;         // webgpuHDR requires async adapter request, deferred to Phase 4

  // Extended HDR capabilities
  /** True if WebGL2 supports drawingBufferStorage() for half-float backbuffer */
  webglDrawingBufferStorage: boolean;
  /** True if canvas.configureHighDynamicRange() API is available */
  canvasExtendedHDR: boolean;

  // HEIC
  /** True if browser can natively decode image/heic (Safari 17+) */
  heicDecode: boolean;

  // VideoFrame
  /** True if VideoFrame API is available (for HDR video texImage2D upload) */
  videoFrameTexImage: boolean;

  // HDR VideoFrame resize via OffscreenCanvas
  /** True if OffscreenCanvas supports HDR-preserving float16 canvas for VideoFrame resize */
  canvasHDRResize: boolean;
  /**
   * Which HDR canvas resize tier is available:
   * - 'rec2100': rec2100-hlg/pq + float16 (experimental, preserves exact HDR signal)
   * - 'display-p3-float16': display-p3 + float16 (stable Chrome 137+, extended-range)
   * - 'none': no HDR-preserving resize available
   */
  canvasHDRResizeTier: 'rec2100' | 'display-p3-float16' | 'none';

  // Derived
  activeColorSpace: 'srgb' | 'display-p3';
  activeHDRMode: 'sdr' | 'hlg' | 'pq' | 'extended' | 'none';
}

// =============================================================================
// Defaults
// =============================================================================

/**
 * Default capabilities with all features disabled / sRGB defaults.
 * Used as a safe fallback when detection is not performed.
 */
export const DEFAULT_CAPABILITIES: DisplayCapabilities = {
  canvasP3: false,
  webglP3: false,
  displayGamut: 'srgb',

  displayHDR: false,
  webglHLG: false,
  webglPQ: false,
  canvasHLG: false,
  canvasFloat16: false,

  webgpuAvailable: false,
  webgpuHDR: false,

  webglDrawingBufferStorage: false,
  canvasExtendedHDR: false,

  heicDecode: false,

  videoFrameTexImage: false,

  canvasHDRResize: false,
  canvasHDRResizeTier: 'none',

  activeColorSpace: 'srgb',
  activeHDRMode: 'sdr',
};

// =============================================================================
// Detection
// =============================================================================

/**
 * Detect display capabilities using throwaway canvases and contexts.
 * All probes are wrapped in try/catch so a throwing browser API
 * never crashes the app.
 *
 * Call once at startup, cache the result, pass to Renderer and Viewer.
 */
export function detectDisplayCapabilities(): DisplayCapabilities {
  const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES };

  // --- Display gamut via matchMedia ---
  try {
    if (typeof matchMedia !== 'undefined') {
      if (matchMedia('(color-gamut: rec2020)').matches) {
        caps.displayGamut = 'rec2020';
      } else if (matchMedia('(color-gamut: p3)').matches) {
        caps.displayGamut = 'p3';
      }
    }
  } catch { /* stays srgb */ }

  // --- Display HDR via matchMedia ---
  try {
    if (typeof matchMedia !== 'undefined') {
      caps.displayHDR = matchMedia('(dynamic-range: high)').matches;
    }
  } catch { /* stays false */ }

  // --- Reuse a single probe canvas for all 2D context tests ---
  // Each getContext('2d', ...) with different options requires a fresh canvas
  // because a canvas can only have one context type. However, we reuse the
  // same DOM element by resetting it between probes (setting width triggers
  // a canvas clear and context invalidation in the spec).
  let probeCanvas: HTMLCanvasElement | null = null;
  try {
    probeCanvas = document.createElement('canvas');
    probeCanvas.width = probeCanvas.height = 1;
  } catch { /* probeCanvas stays null, all canvas tests will be skipped */ }

  // --- 2D canvas P3 support ---
  if (probeCanvas) {
    try {
      const ctx = probeCanvas.getContext('2d', { colorSpace: 'display-p3' } as CanvasRenderingContext2DSettings);
      caps.canvasP3 = ctx !== null;
    } catch { /* stays false */ }
  }

  // --- 2D canvas HLG support (needs fresh canvas - context params locked on first getContext) ---
  let probeCanvas2d2: HTMLCanvasElement | null = null;
  try {
    probeCanvas2d2 = document.createElement('canvas');
    probeCanvas2d2.width = probeCanvas2d2.height = 1;
  } catch { /* stays null */ }

  if (probeCanvas2d2) {
    try {
      // rec2100-hlg is not in PredefinedColorSpace (see src/types/webgl-hdr.d.ts)
      const ctx = probeCanvas2d2.getContext('2d', { colorSpace: 'rec2100-hlg' } as unknown as CanvasRenderingContext2DSettings);
      caps.canvasHLG = ctx !== null;
    } catch { /* stays false */ }
  }

  // --- 2D canvas float16 support (needs fresh canvas) ---
  let probeCanvas2d3: HTMLCanvasElement | null = null;
  try {
    probeCanvas2d3 = document.createElement('canvas');
    probeCanvas2d3.width = probeCanvas2d3.height = 1;
  } catch { /* stays null */ }

  if (probeCanvas2d3) {
    try {
      // rec2100-hlg is not in PredefinedColorSpace; pixelFormat is typed via webgl-hdr.d.ts
      const ctx = probeCanvas2d3.getContext('2d', {
        colorSpace: 'rec2100-hlg',
        pixelFormat: 'float16',
      } as unknown as CanvasRenderingContext2DSettings);
      caps.canvasFloat16 = ctx !== null;
    } catch { /* stays false */ }
  }

  // --- HDR canvas resize tier detection (OffscreenCanvas with float16) ---
  // Tier 1: rec2100-hlg + float16 (experimental, preserves exact HDR signal space)
  // Tier 2: display-p3 + float16 (stable Chrome 137+, extended-range values >1.0)
  //
  // The float16 property name varies by Chrome version:
  //   - Chrome <133: pixelFormat: 'float16'
  //   - Chrome 133-136: colorType: 'float16' (behind flag)
  //   - Chrome 137+: colorType: 'float16' (stable)
  // We try colorType first (newer), then pixelFormat (older).
  if (typeof OffscreenCanvas !== 'undefined') {
    const float16Options = [
      { colorType: 'float16' },
      { pixelFormat: 'float16' },
    ] as const;

    // Tier 1: try rec2100-hlg + float16
    for (const opt of float16Options) {
      if (caps.canvasHDRResize) break;
      try {
        const probe = new OffscreenCanvas(1, 1);
        const ctx = probe.getContext('2d', {
          colorSpace: 'rec2100-hlg',
          ...opt,
        } as unknown as CanvasRenderingContext2DSettings);
        if (ctx) {
          caps.canvasHDRResizeTier = 'rec2100';
          caps.canvasHDRResize = true;
        }
      } catch { /* not available with this option */ }
    }

    // Tier 2: try display-p3 + float16 (only if tier 1 failed)
    for (const opt of float16Options) {
      if (caps.canvasHDRResize) break;
      try {
        const probe = new OffscreenCanvas(1, 1);
        const ctx = probe.getContext('2d', {
          colorSpace: 'display-p3',
          ...opt,
        } as unknown as CanvasRenderingContext2DSettings);
        if (ctx) {
          caps.canvasHDRResizeTier = 'display-p3-float16';
          caps.canvasHDRResize = true;
        }
      } catch { /* not available with this option */ }
    }
  }

  // --- WebGL2 P3, HLG, and PQ support (single context, reuses probeCanvas if no 2D ctx) ---
  // Note: HLG/PQ detection on detached canvases may report false even
  // when the live DOM canvas supports them. The Viewer tries again on
  // the real canvas at render time. displayHDR (matchMedia) is reliable.
  let glProbeCanvas: HTMLCanvasElement | null = null;
  try {
    glProbeCanvas = document.createElement('canvas');
    glProbeCanvas.width = glProbeCanvas.height = 1;
  } catch { /* stays null */ }

  if (glProbeCanvas) {
    try {
      const gl = glProbeCanvas.getContext('webgl2');
      try {
        if (gl && 'drawingBufferColorSpace' in gl) {
          // Test P3
          gl.drawingBufferColorSpace = 'display-p3';
          caps.webglP3 = gl.drawingBufferColorSpace === 'display-p3';
          // Reset
          gl.drawingBufferColorSpace = 'srgb';
          // Test HLG
          gl.drawingBufferColorSpace = 'rec2100-hlg';
          caps.webglHLG = gl.drawingBufferColorSpace === 'rec2100-hlg';
          // Reset
          gl.drawingBufferColorSpace = 'srgb';
          // Test PQ
          gl.drawingBufferColorSpace = 'rec2100-pq';
          caps.webglPQ = gl.drawingBufferColorSpace === 'rec2100-pq';

          // Test drawingBufferStorage availability
          caps.webglDrawingBufferStorage = typeof gl.drawingBufferStorage === 'function';
        }
      } finally {
        const loseCtx = gl?.getExtension('WEBGL_lose_context');
        loseCtx?.loseContext();
      }
    } catch { /* stays false */ }
  }

  // --- canvasExtendedHDR: check if configureHighDynamicRange is available ---
  if (glProbeCanvas) {
    try {
      caps.canvasExtendedHDR = typeof glProbeCanvas.configureHighDynamicRange === 'function';
    } catch { /* stays false */ }
  }

  // --- Cleanup all probe canvases: set dimensions to 0 and nullify references to help GC ---
  if (probeCanvas) {
    probeCanvas.width = probeCanvas.height = 0;
    probeCanvas = null;
  }
  if (probeCanvas2d2) {
    probeCanvas2d2.width = probeCanvas2d2.height = 0;
    probeCanvas2d2 = null;
  }
  if (probeCanvas2d3) {
    probeCanvas2d3.width = probeCanvas2d3.height = 0;
    probeCanvas2d3 = null;
  }
  if (glProbeCanvas) {
    glProbeCanvas.width = glProbeCanvas.height = 0;
    glProbeCanvas = null;
  }

  // --- WebGPU availability ---
  try {
    caps.webgpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator;
  } catch { /* stays false */ }

  // --- HEIC decode availability (HEVC image support, Safari 17+) ---
  try {
    if (typeof document !== 'undefined') {
      const video = document.createElement('video');
      caps.heicDecode = video.canPlayType('video/mp4; codecs="hvc1"') !== '';
    }
  } catch { /* stays false */ }

  // --- VideoFrame availability ---
  try {
    caps.videoFrameTexImage = typeof VideoFrame !== 'undefined';
  } catch { /* stays false */ }

  // --- Derived: activeColorSpace ---
  // Use P3 if both the display supports it and the canvas/webgl can output it
  if (caps.webglP3 && (caps.displayGamut === 'p3' || caps.displayGamut === 'rec2020')) {
    caps.activeColorSpace = 'display-p3';
  }

  // Derive activeHDRMode based on detected capabilities
  if (caps.webglHLG) {
    caps.activeHDRMode = 'hlg';
  } else if (caps.webglPQ) {
    caps.activeHDRMode = 'pq';
  } else if (caps.displayHDR && caps.webglDrawingBufferStorage && caps.canvasExtendedHDR) {
    caps.activeHDRMode = 'extended';
  }

  console.log('[DisplayCapabilities]', {
    displayGamut: caps.displayGamut,
    displayHDR: caps.displayHDR,
    webglP3: caps.webglP3,
    webglHLG: caps.webglHLG,
    webglPQ: caps.webglPQ,
    canvasHLG: caps.canvasHLG,
    canvasFloat16: caps.canvasFloat16,
    webglDrawingBufferStorage: caps.webglDrawingBufferStorage,
    canvasExtendedHDR: caps.canvasExtendedHDR,
    canvasHDRResize: caps.canvasHDRResize,
    canvasHDRResizeTier: caps.canvasHDRResizeTier,
    activeHDRMode: caps.activeHDRMode,
  });

  return caps;
}

// =============================================================================
// HDR Output Availability
// =============================================================================

/**
 * Check if any HDR output path is available based on detected capabilities.
 *
 * Returns true when:
 * 1. WebGL native HDR (HLG/PQ/extended) is active, OR
 * 2. WebGPU HDR blit was detected, OR
 * 3. Display supports HDR + wide gamut (P3/Rec.2020) and WebGPU is available
 *    (blit detection may still be in-flight)
 *
 * This is a pure function of the capabilities object — no runtime queries.
 * For a log-friendly version with diagnostics, use isHDROutputAvailableWithLog().
 */
export function isHDROutputAvailable(caps: DisplayCapabilities): boolean {
  // WebGL native HDR
  if (caps.activeHDRMode !== 'sdr' && caps.activeHDRMode !== 'none') return true;
  // WebGPU HDR (async-detected)
  if (caps.webgpuHDR) return true;
  // Display is HDR + wide gamut, WebGPU can provide the rendering path
  if (caps.webgpuAvailable && caps.displayHDR &&
      (caps.displayGamut === 'p3' || caps.displayGamut === 'rec2020')) return true;
  return false;
}

/**
 * Same as isHDROutputAvailable but logs the detection result with full diagnostics.
 */
export function isHDROutputAvailableWithLog(caps: DisplayCapabilities, extraInfo?: { webgpuBlitReady?: boolean }): boolean {
  const blitReady = extraInfo?.webgpuBlitReady ?? false;

  console.log('[HDR Display]', {
    dynamicRange: caps.displayHDR ? 'high' : 'standard',
    colorGamut: caps.displayGamut,
    activeHDRMode: caps.activeHDRMode,
    webgpuHDR: caps.webgpuHDR,
    webgpuBlitReady: blitReady,
    webgpuAvailable: caps.webgpuAvailable,
  });

  // WebGL native HDR
  if (caps.activeHDRMode !== 'sdr' && caps.activeHDRMode !== 'none') {
    console.log(`[HDR Display] Capable via WebGL native (${caps.activeHDRMode})`);
    return true;
  }
  // WebGPU HDR blit (async-detected or already initialized)
  if (caps.webgpuHDR || blitReady) {
    console.log('[HDR Display] Capable via WebGPU blit');
    return true;
  }
  // Display HDR + wide gamut + WebGPU available (blit detection may be in-flight)
  if (caps.webgpuAvailable && caps.displayHDR &&
      (caps.displayGamut === 'p3' || caps.displayGamut === 'rec2020')) {
    console.log('[HDR Display] Capable via display HDR + wide gamut + WebGPU');
    return true;
  }

  console.log('[HDR Display] Not capable');
  return false;
}

// =============================================================================
// Active Color Space Resolution
// =============================================================================

/**
 * Resolve the active color space based on capabilities and user preference.
 *
 * - 'srgb' preference always forces sRGB
 * - 'display-p3' preference uses P3 if WebGL supports it, else sRGB
 * - 'auto' uses P3 if both WebGL and display support it
 *
 * Note: Canvas color spaces are set at context creation time and cannot be
 * changed afterwards. The gamut preference therefore takes effect on next
 * page reload.
 */
export function resolveActiveColorSpace(
  caps: DisplayCapabilities,
  preference: 'auto' | 'srgb' | 'display-p3',
): 'srgb' | 'display-p3' {
  if (preference === 'srgb') return 'srgb';
  if (preference === 'display-p3') return caps.webglP3 ? 'display-p3' : 'srgb';
  // auto: use P3 if available
  return caps.webglP3 && (caps.displayGamut === 'p3' || caps.displayGamut === 'rec2020') ? 'display-p3' : 'srgb';
}

// =============================================================================
// WebGPU HDR Detection (async)
// =============================================================================

/**
 * Detect whether WebGPU HDR output is likely available.
 *
 * Requests a GPU adapter to verify WebGPU works. The adapter is a
 * lightweight object that does not allocate a device. The actual device
 * creation happens in WebGPUHDRBlit.initialize() — no need to create
 * and immediately destroy a device here just for probing.
 *
 * This is intentionally separate from detectDisplayCapabilities()
 * because it requires async operations.
 */
export async function detectWebGPUHDR(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false;
  try {
    const gpu = (navigator as unknown as { gpu: { requestAdapter(opts?: { powerPreference?: string }): Promise<object | null> } }).gpu;
    const adapter = await gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

// =============================================================================
// HDR Headroom Query (async)
// =============================================================================

/**
 * Query the display's HDR headroom (peak luminance / SDR reference luminance).
 * Returns null if the API is not available or the query fails.
 *
 * This uses the Screen Details API (getScreenDetails) which requires
 * user permission and is only available in some browsers.
 */
export async function queryHDRHeadroom(): Promise<number | null> {
  try {
    if (typeof window !== 'undefined' && window.getScreenDetails) {
      const screenDetails = await window.getScreenDetails();
      const headroom = screenDetails?.currentScreen?.highDynamicRangeHeadroom;
      if (typeof headroom === 'number' && Number.isFinite(headroom) && headroom > 0) {
        return headroom;
      }
    }
  } catch {
    // Permission denied or API not available
  }
  return null;
}
