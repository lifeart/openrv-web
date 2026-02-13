/**
 * Perspective Correction
 *
 * Implements four-corner perspective warp using homography.
 * Supports both GPU (inverse homography matrix for shader) and
 * CPU (inverse mapping with bilinear/bicubic interpolation) paths.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface PerspectiveCorrectionParams {
  enabled: boolean;
  topLeft: Point2D;      // default (0, 0)
  topRight: Point2D;     // default (1, 0)
  bottomRight: Point2D;  // default (1, 1)
  bottomLeft: Point2D;   // default (0, 1)
  quality: 'bilinear' | 'bicubic';
}

export const DEFAULT_PERSPECTIVE_PARAMS: PerspectiveCorrectionParams = {
  enabled: false,
  topLeft: { x: 0, y: 0 },
  topRight: { x: 1, y: 0 },
  bottomRight: { x: 1, y: 1 },
  bottomLeft: { x: 0, y: 1 },
  quality: 'bilinear',
};

const EPSILON = 1e-6;

/**
 * Check if perspective correction is active (enabled AND corners deviate from default).
 */
export function isPerspectiveActive(params: PerspectiveCorrectionParams): boolean {
  if (!params.enabled) return false;
  const d = DEFAULT_PERSPECTIVE_PARAMS;
  return (
    Math.abs(params.topLeft.x - d.topLeft.x) > EPSILON ||
    Math.abs(params.topLeft.y - d.topLeft.y) > EPSILON ||
    Math.abs(params.topRight.x - d.topRight.x) > EPSILON ||
    Math.abs(params.topRight.y - d.topRight.y) > EPSILON ||
    Math.abs(params.bottomRight.x - d.bottomRight.x) > EPSILON ||
    Math.abs(params.bottomRight.y - d.bottomRight.y) > EPSILON ||
    Math.abs(params.bottomLeft.x - d.bottomLeft.x) > EPSILON ||
    Math.abs(params.bottomLeft.y - d.bottomLeft.y) > EPSILON
  );
}

/**
 * Compute a 3x3 homography mapping src[] → dst[] using the DLT algorithm.
 * Both src and dst are arrays of 4 Point2D.
 * Returns a row-major Float64Array(9).
 */
export function computeHomography(src: Point2D[], dst: Point2D[]): Float64Array {
  // Build the 8x8 system A*h = b
  // For each point correspondence (x,y) -> (x',y'):
  //   [x, y, 1, 0, 0, 0, -x'x, -x'y] [h1]   [x']
  //   [0, 0, 0, x, y, 1, -y'x, -y'y] [h2] = [y']
  const A = new Float64Array(64); // 8x8
  const b = new Float64Array(8);

  for (let i = 0; i < 4; i++) {
    const sx = src[i]!.x, sy = src[i]!.y;
    const dx = dst[i]!.x, dy = dst[i]!.y;
    const r1 = i * 2;
    const r2 = r1 + 1;

    // Row r1: [sx, sy, 1, 0, 0, 0, -dx*sx, -dx*sy] = dx
    A[r1 * 8 + 0] = sx;
    A[r1 * 8 + 1] = sy;
    A[r1 * 8 + 2] = 1;
    A[r1 * 8 + 6] = -dx * sx;
    A[r1 * 8 + 7] = -dx * sy;
    b[r1] = dx;

    // Row r2: [0, 0, 0, sx, sy, 1, -dy*sx, -dy*sy] = dy
    A[r2 * 8 + 3] = sx;
    A[r2 * 8 + 4] = sy;
    A[r2 * 8 + 5] = 1;
    A[r2 * 8 + 6] = -dy * sx;
    A[r2 * 8 + 7] = -dy * sy;
    b[r2] = dy;
  }

  // Solve using Gaussian elimination with partial pivoting
  const h = solveLinearSystem8x8(A, b);

  // H = [h0, h1, h2; h3, h4, h5; h6, h7, 1] (row-major)
  const H = new Float64Array(9);
  for (let i = 0; i < 8; i++) H[i] = h[i]!;
  H[8] = 1.0;
  return H;
}

/**
 * Solve an 8x8 linear system Ax=b via Gaussian elimination with partial pivoting.
 */
function solveLinearSystem8x8(A: Float64Array, b: Float64Array): Float64Array {
  const n = 8;
  // Augmented matrix [A|b]
  const aug = new Float64Array(n * (n + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      aug[i * (n + 1) + j] = A[i * n + j]!;
    }
    aug[i * (n + 1) + n] = b[i]!;
  }

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxVal = Math.abs(aug[col * (n + 1) + col]!);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(aug[row * (n + 1) + col]!);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }

    // Swap rows
    if (maxRow !== col) {
      for (let j = col; j <= n; j++) {
        const tmp = aug[col * (n + 1) + j]!;
        aug[col * (n + 1) + j] = aug[maxRow * (n + 1) + j]!;
        aug[maxRow * (n + 1) + j] = tmp;
      }
    }

    const pivot = aug[col * (n + 1) + col]!;
    if (Math.abs(pivot) < 1e-12) {
      // Degenerate system — return identity-like result
      return new Float64Array([1, 0, 0, 0, 1, 0, 0, 0]);
    }

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row * (n + 1) + col]! / pivot;
      for (let j = col; j <= n; j++) {
        aug[row * (n + 1) + j] = aug[row * (n + 1) + j]! - factor * aug[col * (n + 1) + j]!;
      }
    }
  }

  // Back substitution
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = aug[i * (n + 1) + n]!;
    for (let j = i + 1; j < n; j++) {
      sum -= aug[i * (n + 1) + j]! * x[j]!;
    }
    x[i] = sum / aug[i * (n + 1) + i]!;
  }

  return x;
}

/**
 * Invert a 3x3 homography matrix (row-major).
 * Uses analytic cofactor inversion. Returns identity if degenerate.
 */
export function invertHomography3x3(H: Float64Array): Float64Array {
  const [a, b, c, d, e, f, g, h, i] = H;
  const det = a! * (e! * i! - f! * h!) - b! * (d! * i! - f! * g!) + c! * (d! * h! - e! * g!);

  if (Math.abs(det) < 1e-12) {
    // Degenerate — return identity
    return new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  }

  const invDet = 1.0 / det;
  const inv = new Float64Array(9);
  inv[0] = (e! * i! - f! * h!) * invDet;
  inv[1] = (c! * h! - b! * i!) * invDet;
  inv[2] = (b! * f! - c! * e!) * invDet;
  inv[3] = (f! * g! - d! * i!) * invDet;
  inv[4] = (a! * i! - c! * g!) * invDet;
  inv[5] = (c! * d! - a! * f!) * invDet;
  inv[6] = (d! * h! - e! * g!) * invDet;
  inv[7] = (b! * g! - a! * h!) * invDet;
  inv[8] = (a! * e! - b! * d!) * invDet;

  return inv;
}

/**
 * Compute perspective correction homography as column-major Float32Array(9) for GLSL mat3.
 * Maps from unit square (output rectangle) to the user's quad (source positions).
 * Used for shader inverse mapping: for each output pixel, find the source UV to sample.
 */
export function computeInverseHomographyFloat32(params: PerspectiveCorrectionParams): Float32Array {
  if (!isPerspectiveActive(params)) {
    // Identity matrix (column-major)
    return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  }

  // Source is always the unit square corners (output rectangle)
  const src: Point2D[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];

  // Destination is the user's quad (source positions in the original image)
  const dst: Point2D[] = [
    params.topLeft,
    params.topRight,
    params.bottomRight,
    params.bottomLeft,
  ];

  // H maps output rect → source quad. This is exactly what the shader needs:
  // for each output pixel at position P, sample source at H(P).
  const H = computeHomography(src, dst);

  // Convert row-major to column-major for GLSL
  const colMajor = new Float32Array(9);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      colMajor[col * 3 + row] = H[row * 3 + col]!;
    }
  }
  return colMajor;
}

/**
 * Catmull-Rom spline weight function for bicubic interpolation.
 */
function catmullRomWeight(t: number): number {
  const at = Math.abs(t);
  if (at < 1) return 1.5 * at * at * at - 2.5 * at * at + 1;
  if (at < 2) return -0.5 * at * at * at + 2.5 * at * at - 4 * at + 2;
  return 0;
}

/**
 * Sample a pixel from ImageData with bounds checking.
 * Returns [r, g, b, a] or [0, 0, 0, 0] if out of bounds.
 */
function samplePixel(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): [number, number, number, number] {
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return [0, 0, 0, 0];
  }
  const idx = (y * width + x) * 4;
  return [data[idx]!, data[idx + 1]!, data[idx + 2]!, data[idx + 3]!];
}

/**
 * Bilinear interpolation at fractional coordinates.
 */
function bilinearSample(data: Uint8ClampedArray, width: number, height: number, sx: number, sy: number): [number, number, number, number] {
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;

  if (x0 < 0 || x0 >= width - 1 || y0 < 0 || y0 >= height - 1) {
    // Near boundary: use nearest or transparent
    if (x0 < -1 || x0 >= width || y0 < -1 || y0 >= height) {
      return [0, 0, 0, 0];
    }
    // Boundary interpolation with bounds checking
    const p00 = samplePixel(data, width, height, x0, y0);
    const p10 = samplePixel(data, width, height, x0 + 1, y0);
    const p01 = samplePixel(data, width, height, x0, y0 + 1);
    const p11 = samplePixel(data, width, height, x0 + 1, y0 + 1);
    const result: [number, number, number, number] = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) {
      result[c] = Math.round(
        p00[c]! * (1 - fx) * (1 - fy) +
        p10[c]! * fx * (1 - fy) +
        p01[c]! * (1 - fx) * fy +
        p11[c]! * fx * fy
      );
    }
    return result;
  }

  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  const idx00 = (y0 * width + x0) * 4;
  const idx10 = (y0 * width + x0 + 1) * 4;
  const idx01 = ((y0 + 1) * width + x0) * 4;
  const idx11 = ((y0 + 1) * width + x0 + 1) * 4;

  return [
    Math.round(data[idx00]! * w00 + data[idx10]! * w10 + data[idx01]! * w01 + data[idx11]! * w11),
    Math.round(data[idx00 + 1]! * w00 + data[idx10 + 1]! * w10 + data[idx01 + 1]! * w01 + data[idx11 + 1]! * w11),
    Math.round(data[idx00 + 2]! * w00 + data[idx10 + 2]! * w10 + data[idx01 + 2]! * w01 + data[idx11 + 2]! * w11),
    Math.round(data[idx00 + 3]! * w00 + data[idx10 + 3]! * w10 + data[idx01 + 3]! * w01 + data[idx11 + 3]! * w11),
  ];
}

/**
 * Bicubic (Catmull-Rom) interpolation at fractional coordinates.
 */
function bicubicSample(data: Uint8ClampedArray, width: number, height: number, sx: number, sy: number): [number, number, number, number] {
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;

  const result: [number, number, number, number] = [0, 0, 0, 0];

  for (let j = -1; j <= 2; j++) {
    const wy = catmullRomWeight(j - fy);
    for (let i = -1; i <= 2; i++) {
      const wx = catmullRomWeight(i - fx);
      const px = Math.max(0, Math.min(width - 1, x0 + i));
      const py = Math.max(0, Math.min(height - 1, y0 + j));
      const idx = (py * width + px) * 4;
      const w = wx * wy;
      result[0] += data[idx]! * w;
      result[1] += data[idx + 1]! * w;
      result[2] += data[idx + 2]! * w;
      result[3] += data[idx + 3]! * w;
    }
  }

  return [
    Math.round(Math.max(0, Math.min(255, result[0]))),
    Math.round(Math.max(0, Math.min(255, result[1]))),
    Math.round(Math.max(0, Math.min(255, result[2]))),
    Math.round(Math.max(0, Math.min(255, result[3]))),
  ];
}

/**
 * Apply perspective correction to an ImageData using CPU inverse mapping.
 * Returns a NEW ImageData.
 */
export function applyPerspectiveCorrection(
  sourceData: ImageData,
  params: PerspectiveCorrectionParams
): ImageData {
  if (!isPerspectiveActive(params)) {
    return sourceData;
  }

  const width = sourceData.width;
  const height = sourceData.height;
  const src = sourceData.data;

  // Compute forward homography (output rectangle → source quad)
  // For correction: output pixel P maps to source position H(P)
  const unitSquare: Point2D[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const quad: Point2D[] = [
    params.topLeft,
    params.topRight,
    params.bottomRight,
    params.bottomLeft,
  ];

  const H = computeHomography(unitSquare, quad);

  const output = new ImageData(width, height);
  const dst = output.data;
  const useBicubic = params.quality === 'bicubic';

  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      // Normalize destination pixel to [0, 1]
      const nx = (dx + 0.5) / width;
      const ny = (dy + 0.5) / height;

      // Apply forward homography (output → source)
      const srcHx = H[0]! * nx + H[1]! * ny + H[2]!;
      const srcHy = H[3]! * nx + H[4]! * ny + H[5]!;
      const srcHz = H[6]! * nx + H[7]! * ny + H[8]!;

      const dstIdx = (dy * width + dx) * 4;

      // Division guard
      if (Math.abs(srcHz) < EPSILON) {
        dst[dstIdx] = 0;
        dst[dstIdx + 1] = 0;
        dst[dstIdx + 2] = 0;
        dst[dstIdx + 3] = 0;
        continue;
      }

      // Perspective divide
      const srcU = srcHx / srcHz;
      const srcV = srcHy / srcHz;

      // Out of bounds check
      if (srcU < 0 || srcU > 1 || srcV < 0 || srcV > 1) {
        dst[dstIdx] = 0;
        dst[dstIdx + 1] = 0;
        dst[dstIdx + 2] = 0;
        dst[dstIdx + 3] = 0;
        continue;
      }

      // Convert back to pixel coordinates
      const sx = srcU * width - 0.5;
      const sy = srcV * height - 0.5;

      const pixel = useBicubic
        ? bicubicSample(src, width, height, sx, sy)
        : bilinearSample(src, width, height, sx, sy);

      dst[dstIdx] = pixel[0];
      dst[dstIdx + 1] = pixel[1];
      dst[dstIdx + 2] = pixel[2];
      dst[dstIdx + 3] = pixel[3];
    }
  }

  return output;
}

/**
 * Generate grid points for perspective overlay rendering.
 * Uses forward homography to compute subdivision points.
 * Returns an array of rows, each row is an array of points.
 */
export function generatePerspectiveGrid(
  params: PerspectiveCorrectionParams,
  subdivisions: number
): Point2D[][] {
  // Compute forward homography (unit square → user quad)
  const unitSquare: Point2D[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const quad: Point2D[] = [
    params.topLeft,
    params.topRight,
    params.bottomRight,
    params.bottomLeft,
  ];

  const H = computeHomography(unitSquare, quad);

  const grid: Point2D[][] = [];
  for (let j = 0; j <= subdivisions; j++) {
    const row: Point2D[] = [];
    for (let i = 0; i <= subdivisions; i++) {
      const u = i / subdivisions;
      const v = j / subdivisions;

      // Apply forward homography
      const hx = H[0]! * u + H[1]! * v + H[2]!;
      const hy = H[3]! * u + H[4]! * v + H[5]!;
      const hz = H[6]! * u + H[7]! * v + H[8]!;

      if (Math.abs(hz) < EPSILON) {
        row.push({ x: u, y: v });
      } else {
        row.push({ x: hx / hz, y: hy / hz });
      }
    }
    grid.push(row);
  }

  return grid;
}
