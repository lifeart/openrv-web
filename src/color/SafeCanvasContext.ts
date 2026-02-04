/**
 * SafeCanvasContext - Safe canvas context creation with color space fallback
 *
 * Wraps canvas.getContext('2d') calls with try/catch to safely
 * attempt requesting a wide-gamut or HDR color space. If the
 * browser doesn't support the requested color space, falls back
 * to the standard sRGB context.
 */

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
      const ctx = canvas.getContext('2d', { ...baseOptions, colorSpace } as CanvasRenderingContext2DSettings);
      if (ctx) return ctx;
    } catch { /* fall through to sRGB fallback */ }
  }
  const ctx = canvas.getContext('2d', baseOptions);
  if (!ctx) throw new Error('Failed to create 2D canvas context');
  return ctx;
}
