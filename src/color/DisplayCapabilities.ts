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

  // VideoFrame
  /** True if VideoFrame API is available (for HDR video texImage2D upload) */
  videoFrameTexImage: boolean;

  // Derived
  activeColorSpace: 'srgb' | 'display-p3';
  activeHDRMode: 'sdr' | 'hlg' | 'pq' | 'none';
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

  videoFrameTexImage: false,

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
        }
      } finally {
        const loseCtx = gl?.getExtension('WEBGL_lose_context');
        loseCtx?.loseContext();
      }
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
  }

  console.log('[DisplayCapabilities]', {
    displayGamut: caps.displayGamut,
    displayHDR: caps.displayHDR,
    webglP3: caps.webglP3,
    webglHLG: caps.webglHLG,
    webglPQ: caps.webglPQ,
    canvasHLG: caps.canvasHLG,
    canvasFloat16: caps.canvasFloat16,
    activeHDRMode: caps.activeHDRMode,
  });

  return caps;
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
