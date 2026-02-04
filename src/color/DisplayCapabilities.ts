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

  // --- 2D canvas P3 support ---
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d', { colorSpace: 'display-p3' } as CanvasRenderingContext2DSettings);
    caps.canvasP3 = ctx !== null;
  } catch { /* stays false */ }

  // --- 2D canvas HLG support ---
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    // rec2100-hlg is experimental and not in TS typings yet
    const ctx = c.getContext('2d', { colorSpace: 'rec2100-hlg' } as unknown as CanvasRenderingContext2DSettings);
    caps.canvasHLG = ctx !== null;
  } catch { /* stays false */ }

  // --- 2D canvas float16 support ---
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    // pixelFormat and rec2100-hlg are experimental and not in TS typings yet
    const ctx = c.getContext('2d', {
      colorSpace: 'rec2100-hlg',
      pixelFormat: 'float16',
    } as unknown as CanvasRenderingContext2DSettings);
    caps.canvasFloat16 = ctx !== null;
  } catch { /* stays false */ }

  // --- WebGL2 P3, HLG, and PQ support (single context) ---
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const gl = c.getContext('webgl2');
    try {
      if (gl && 'drawingBufferColorSpace' in gl) {
        // Widen drawingBufferColorSpace to string for experimental color space values
        // (rec2100-hlg, rec2100-pq) not yet in TypeScript's PredefinedColorSpace type
        type WebGL2WithExtendedColorSpace = Omit<WebGL2RenderingContext, 'drawingBufferColorSpace'> & { drawingBufferColorSpace: string };
        const glExt = gl as unknown as WebGL2WithExtendedColorSpace;
        // Test P3
        glExt.drawingBufferColorSpace = 'display-p3';
        caps.webglP3 = glExt.drawingBufferColorSpace === 'display-p3';
        // Reset
        glExt.drawingBufferColorSpace = 'srgb';
        // Test HLG
        glExt.drawingBufferColorSpace = 'rec2100-hlg';
        caps.webglHLG = glExt.drawingBufferColorSpace === 'rec2100-hlg';
        // Reset
        glExt.drawingBufferColorSpace = 'srgb';
        // Test PQ
        glExt.drawingBufferColorSpace = 'rec2100-pq';
        caps.webglPQ = glExt.drawingBufferColorSpace === 'rec2100-pq';
      }
    } finally {
      const loseCtx = gl?.getExtension('WEBGL_lose_context');
      loseCtx?.loseContext();
    }
  } catch { /* stays false */ }

  // --- WebGPU availability ---
  try {
    caps.webgpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator;
  } catch { /* stays false */ }

  // --- Derived: activeColorSpace ---
  // Use P3 if both the display supports it and the canvas/webgl can output it
  if (caps.webglP3 && (caps.displayGamut === 'p3' || caps.displayGamut === 'rec2020')) {
    caps.activeColorSpace = 'display-p3';
  }

  // activeHDRMode stays 'sdr' in Phase 1

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
    // The Screen Details API is experimental; type assertions needed
    if (typeof window !== 'undefined' && 'getScreenDetails' in window) {
      const screenDetails = await (window as unknown as { getScreenDetails: () => Promise<{ currentScreen: { highDynamicRangeHeadroom?: number } }> }).getScreenDetails();
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
