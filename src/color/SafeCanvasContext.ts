/**
 * SafeCanvasContext - Safe canvas context creation with color space fallback
 *
 * Wraps canvas.getContext('2d') calls with try/catch to safely
 * attempt requesting a wide-gamut or HDR color space. If the
 * browser doesn't support the requested color space, falls back
 * to the standard sRGB context.
 */

import type { DisplayCapabilities } from './DisplayCapabilities';

/**
 * Create a 2D canvas context, optionally requesting a non-sRGB color space.
 *
 * If the requested colorSpace is not supported by the browser,
 * silently falls back to a standard sRGB context.
 *
 * @param canvas - The canvas element to get the context from
 * @param baseOptions - Standard CanvasRenderingContext2DSettings (alpha, willReadFrequently, etc.)
 * @param colorSpace - Optional color space to request ('display-p3' or 'rec2100-hlg')
 * @returns A valid CanvasRenderingContext2D (never null)
 */
export function safeCanvasContext2D(
  canvas: HTMLCanvasElement,
  baseOptions: CanvasRenderingContext2DSettings,
  colorSpace?: 'display-p3' | 'rec2100-hlg',
): CanvasRenderingContext2D {
  if (colorSpace) {
    try {
      // rec2100-hlg is not in PredefinedColorSpace yet; cast needed for HDR color spaces
      const ctx = canvas.getContext('2d', { ...baseOptions, colorSpace } as CanvasRenderingContext2DSettings);
      if (ctx) return ctx;
    } catch { /* fall through to sRGB fallback */ }
  }
  const ctx = canvas.getContext('2d', baseOptions);
  if (!ctx) throw new Error('Failed to create 2D canvas context');
  return ctx;
}

/**
 * Create a viewer canvas with the best available color space for the given HDR mode.
 *
 * Tries HDR (rec2100-hlg with float16) first if requested and supported,
 * then falls back to Display P3 if supported, then standard sRGB.
 *
 * @param caps - Display capabilities detected at startup
 * @param hdrMode - Requested HDR output mode ('sdr', 'hlg', or 'pq')
 * @returns An object with the created canvas and its 2D context
 */
export function createViewerCanvas(
  caps: DisplayCapabilities,
  hdrMode: 'sdr' | 'hlg' | 'pq' | 'extended',
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  const baseOpts: CanvasRenderingContext2DSettings = { alpha: false, willReadFrequently: true };

  // Try HDR first (if requested and supported)
  if (hdrMode === 'hlg' && caps.canvasHLG) {
    try {
      // rec2100-hlg is not in PredefinedColorSpace; pixelFormat is typed via webgl-hdr.d.ts
      const ctx = canvas.getContext('2d', {
        ...baseOpts,
        colorSpace: 'rec2100-hlg',
        pixelFormat: 'float16',
      } as unknown as CanvasRenderingContext2DSettings);
      if (ctx) return { canvas, ctx };
    } catch { /* fall through */ }
  }

  // Try P3 (if supported)
  if (caps.canvasP3) {
    try {
      const ctx = canvas.getContext('2d', {
        ...baseOpts,
        colorSpace: 'display-p3',
      });
      if (ctx) return { canvas, ctx };
    } catch { /* fall through */ }
  }

  // Final fallback: standard sRGB
  const ctx = canvas.getContext('2d', baseOpts);
  if (!ctx) throw new Error('Failed to create 2D canvas context');
  return { canvas, ctx };
}
