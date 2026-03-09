/**
 * Epsilon values for pixel comparison, calibrated for different precision contexts.
 */
export const EPSILON = {
  /** 8-bit SDR: 1/256 = ~0.0039 */
  SDR_BYTE: 1 / 256,

  /** 8-bit SDR with some headroom for rounding across 2+ stages: 2/256 */
  SDR_BYTE_RELAXED: 2 / 256,

  /** Integer pixel values (0-255 range) */
  SDR_INT: 1,

  /** Relaxed integer (0-255 range, multi-stage) */
  SDR_INT_RELAXED: 2,

  /** Float pipeline (RGBA16F): suitable for HDR tests */
  HDR_HALF: 1 / 1024,

  /** Float pipeline (RGBA32F): tightest tolerance */
  HDR_FULL: 1 / 65536,

  /** Cross-backend comparison (WebGL2 vs WebGPU): wider tolerance for driver differences */
  CROSS_BACKEND: 3 / 256,
} as const;

/**
 * Detect if running on SwiftShader (software renderer).
 */
export function isSwiftShader(gl: WebGL2RenderingContext): boolean {
  const renderer = gl.getParameter(gl.RENDERER) as string;
  return renderer.toLowerCase().includes('swiftshader');
}
