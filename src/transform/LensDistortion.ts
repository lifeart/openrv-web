/**
 * Lens Distortion Correction
 *
 * Implements Brown-Conrady distortion model for correcting
 * barrel and pincushion lens distortion.
 *
 * Radial distortion: r_corrected = r * (1 + k1*r^2 + k2*r^4)
 * Where r is the normalized radius from center (0 to 1 at corners)
 */

export interface LensDistortionParams {
  // Radial distortion coefficients
  k1: number;  // Primary radial (-1 to 1, negative = barrel, positive = pincushion)
  k2: number;  // Secondary radial (-1 to 1)
  k3: number;  // Tertiary radial distortion
  // Tangential distortion coefficients (decentering)
  p1: number;  // Tangential X
  p2: number;  // Tangential Y
  // Center offset (normalized, 0 = center)
  centerX: number;  // -0.5 to 0.5
  centerY: number;  // -0.5 to 0.5
  // Scale to compensate for distortion cropping
  scale: number;  // 0.5 to 2.0
  // Distortion model type
  model: 'brown' | 'opencv' | 'pfbarrel' | '3de4_radial_standard' | '3de4_anamorphic' | '3de4_anamorphic_degree_6';
  // Pixel aspect ratio
  pixelAspectRatio: number;
  // Focal length (normalized)
  fx: number;
  fy: number;
  // Crop ratios for output
  cropRatioX: number;
  cropRatioY: number;

  // 3DE4 Anamorphic Degree 6 coefficients (x-direction)
  cx02?: number;
  cx22?: number;
  cx04?: number;
  cx24?: number;
  cx44?: number;
  cx06?: number;
  cx26?: number;
  cx46?: number;
  cx66?: number;

  // 3DE4 Anamorphic Degree 6 coefficients (y-direction)
  cy02?: number;
  cy22?: number;
  cy04?: number;
  cy24?: number;
  cy44?: number;
  cy06?: number;
  cy26?: number;
  cy46?: number;
  cy66?: number;

  // 3DE4 Anamorphic optional parameters
  lensRotation?: number;
  squeeze_x?: number;
  squeeze_y?: number;
}

export const DEFAULT_LENS_PARAMS: LensDistortionParams = {
  k1: 0,
  k2: 0,
  k3: 0,
  p1: 0,
  p2: 0,
  centerX: 0,
  centerY: 0,
  scale: 1,
  model: 'brown',
  pixelAspectRatio: 1,
  fx: 1,
  fy: 1,
  cropRatioX: 1,
  cropRatioY: 1,
};

/**
 * Check if lens parameters are at defaults (no correction)
 */
export function isDefaultLensParams(params: Partial<LensDistortionParams>): boolean {
  // Check Brown-Conrady coefficients
  const brownDefault = (
    (params.k1 ?? 0) === 0 &&
    (params.k2 ?? 0) === 0 &&
    (params.k3 ?? 0) === 0 &&
    (params.p1 ?? 0) === 0 &&
    (params.p2 ?? 0) === 0 &&
    (params.centerX ?? 0) === 0 &&
    (params.centerY ?? 0) === 0 &&
    (params.scale ?? 1) === 1
  );

  if (!brownDefault) return false;

  // Check 3DE4 anamorphic degree 6 coefficients
  const anamorphicDefault = (
    (params.cx02 ?? 0) === 0 &&
    (params.cx22 ?? 0) === 0 &&
    (params.cx04 ?? 0) === 0 &&
    (params.cx24 ?? 0) === 0 &&
    (params.cx44 ?? 0) === 0 &&
    (params.cx06 ?? 0) === 0 &&
    (params.cx26 ?? 0) === 0 &&
    (params.cx46 ?? 0) === 0 &&
    (params.cx66 ?? 0) === 0 &&
    (params.cy02 ?? 0) === 0 &&
    (params.cy22 ?? 0) === 0 &&
    (params.cy04 ?? 0) === 0 &&
    (params.cy24 ?? 0) === 0 &&
    (params.cy44 ?? 0) === 0 &&
    (params.cy06 ?? 0) === 0 &&
    (params.cy26 ?? 0) === 0 &&
    (params.cy46 ?? 0) === 0 &&
    (params.cy66 ?? 0) === 0
  );

  return anamorphicDefault;
}

/**
 * Apply 3DE4 anamorphic degree 6 distortion to a normalized point.
 *
 * The 3DE4 anamorphic model uses a bivariate polynomial:
 *   dx = x * (cx02*r² + cx22*x² + cx04*r⁴ + cx24*x²*r² + cx44*x⁴ + cx06*r⁶ + cx26*x²*r⁴ + cx46*x⁴*r² + cx66*x⁶)
 *   dy = y * (cy02*r² + cy22*y² + cy04*r⁴ + cy24*y²*r² + cy44*y⁴ + cy06*r⁶ + cy26*y²*r⁴ + cy46*y⁴*r² + cy66*y⁶)
 *   distorted = (x + dx, y + dy)
 */
export function apply3DE4AnamorphicDeg6(
  x: number,
  y: number,
  params: LensDistortionParams,
): { x: number; y: number } {
  const cx02 = params.cx02 ?? 0;
  const cx22 = params.cx22 ?? 0;
  const cx04 = params.cx04 ?? 0;
  const cx24 = params.cx24 ?? 0;
  const cx44 = params.cx44 ?? 0;
  const cx06 = params.cx06 ?? 0;
  const cx26 = params.cx26 ?? 0;
  const cx46 = params.cx46 ?? 0;
  const cx66 = params.cx66 ?? 0;

  const cy02 = params.cy02 ?? 0;
  const cy22 = params.cy22 ?? 0;
  const cy04 = params.cy04 ?? 0;
  const cy24 = params.cy24 ?? 0;
  const cy44 = params.cy44 ?? 0;
  const cy06 = params.cy06 ?? 0;
  const cy26 = params.cy26 ?? 0;
  const cy46 = params.cy46 ?? 0;
  const cy66 = params.cy66 ?? 0;

  const r2 = x * x + y * y;
  const r4 = r2 * r2;
  const r6 = r4 * r2;
  const x2 = x * x;
  const x4 = x2 * x2;
  const x6 = x4 * x2;
  const y2 = y * y;
  const y4 = y2 * y2;
  const y6 = y4 * y2;

  const dx = x * (
    cx02 * r2 + cx22 * x2 +
    cx04 * r4 + cx24 * x2 * r2 + cx44 * x4 +
    cx06 * r6 + cx26 * x2 * r4 + cx46 * x4 * r2 + cx66 * x6
  );

  const dy = y * (
    cy02 * r2 + cy22 * y2 +
    cy04 * r4 + cy24 * y2 * r2 + cy44 * y4 +
    cy06 * r6 + cy26 * y2 * r4 + cy46 * y4 * r2 + cy66 * y6
  );

  return {
    x: x + dx,
    y: y + dy,
  };
}

/**
 * Apply inverse radial distortion to get source coordinates
 * Given a destination point, find where it came from in the source
 * Includes tangential (decentering) distortion support
 */
function undistortPoint(
  dx: number,  // Destination x (normalized -1 to 1)
  dy: number,  // Destination y (normalized -1 to 1)
  k1: number,
  k2: number,
  k3 = 0,
  p1 = 0,
  p2 = 0
): { x: number; y: number } {
  const r2 = dx * dx + dy * dy;
  const r4 = r2 * r2;
  const r6 = r4 * r2;

  // Radial distortion factor (Brown-Conrady model)
  const radialFactor = 1 + k1 * r2 + k2 * r4 + k3 * r6;

  // Tangential (decentering) distortion
  const tangentialX = 2 * p1 * dx * dy + p2 * (r2 + 2 * dx * dx);
  const tangentialY = p1 * (r2 + 2 * dy * dy) + 2 * p2 * dx * dy;

  return {
    x: dx * radialFactor + tangentialX,
    y: dy * radialFactor + tangentialY,
  };
}

/**
 * Apply lens distortion correction to an ImageData
 * Uses inverse mapping for better quality
 */
export function applyLensDistortion(
  sourceData: ImageData,
  params: LensDistortionParams
): ImageData {
  if (isDefaultLensParams(params)) {
    return sourceData;
  }

  const { k1, k2, k3, p1, p2, centerX, centerY, scale, pixelAspectRatio } = params;
  const width = sourceData.width;
  const height = sourceData.height;
  const src = sourceData.data;

  // Create output ImageData
  const output = new ImageData(width, height);
  const dst = output.data;

  // Use max dimension for proper circular distortion
  const maxDim = Math.max(width, height);

  // Center point with offset
  const cx = width / 2 + centerX * width;
  const cy = height / 2 + centerY * height;

  // Process each destination pixel
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      // Normalize coordinates to -1 to 1 range (accounting for aspect ratio and pixel aspect ratio)
      let nx = ((dx - cx) / maxDim) * 2 * scale;
      let ny = ((dy - cy) / maxDim) * 2 * scale * pixelAspectRatio;

      // Apply inverse distortion to find source coordinates
      let undistorted: { x: number; y: number };
      if (params.model === '3de4_anamorphic_degree_6') {
        undistorted = apply3DE4AnamorphicDeg6(nx, ny, params);
      } else {
        undistorted = undistortPoint(nx, ny, k1, k2, k3, p1, p2);
      }

      // Compensate for pixel aspect ratio in output
      undistorted.y /= pixelAspectRatio;

      // Convert back to pixel coordinates
      const sx = undistorted.x * maxDim / 2 + cx;
      const sy = undistorted.y * maxDim / 2 + cy;

      // Bilinear interpolation for smooth results
      const dstIdx = (dy * width + dx) * 4;

      if (sx >= 0 && sx < width - 1 && sy >= 0 && sy < height - 1) {
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const x1 = x0 + 1;
        const y1 = y0 + 1;

        const fx = sx - x0;
        const fy = sy - y0;

        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;

        const idx00 = (y0 * width + x0) * 4;
        const idx10 = (y0 * width + x1) * 4;
        const idx01 = (y1 * width + x0) * 4;
        const idx11 = (y1 * width + x1) * 4;

        for (let c = 0; c < 4; c++) {
          dst[dstIdx + c] = Math.round(
            src[idx00 + c]! * w00 +
            src[idx10 + c]! * w10 +
            src[idx01 + c]! * w01 +
            src[idx11 + c]! * w11
          );
        }
      } else {
        // Outside source bounds - transparent or black
        dst[dstIdx] = 0;
        dst[dstIdx + 1] = 0;
        dst[dstIdx + 2] = 0;
        dst[dstIdx + 3] = 255;
      }
    }
  }

  return output;
}

/**
 * Apply lens distortion to a canvas context
 */
export function applyLensDistortionToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: LensDistortionParams
): void {
  if (isDefaultLensParams(params)) return;

  const sourceData = ctx.getImageData(0, 0, width, height);
  const correctedData = applyLensDistortion(sourceData, params);
  ctx.putImageData(correctedData, 0, 0);
}

/**
 * Generate a distortion preview grid
 */
export function generateDistortionGrid(
  width: number,
  height: number,
  params: LensDistortionParams,
  gridSize = 20
): { lines: Array<{ x1: number; y1: number; x2: number; y2: number }> } {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const { k1, k2, k3, p1, p2, centerX, centerY, scale, pixelAspectRatio } = params;

  const cx = width / 2 + centerX * width;
  const cy = height / 2 + centerY * height;
  const maxDim = Math.max(width, height);

  // Helper to transform a point
  const transformPoint = (px: number, py: number): { x: number; y: number } => {
    let nx = ((px - cx) / maxDim) * 2 * scale;
    let ny = ((py - cy) / maxDim) * 2 * scale * pixelAspectRatio;
    let undist: { x: number; y: number };
    if (params.model === '3de4_anamorphic_degree_6') {
      undist = apply3DE4AnamorphicDeg6(nx, ny, params);
    } else {
      undist = undistortPoint(nx, ny, k1, k2, k3, p1, p2);
    }
    return {
      x: undist.x * maxDim / 2 + cx,
      y: (undist.y / pixelAspectRatio) * maxDim / 2 + cy,
    };
  };

  // Generate horizontal lines
  for (let y = 0; y <= height; y += gridSize) {
    for (let x = 0; x < width; x += gridSize) {
      const p1 = transformPoint(x, y);
      const p2 = transformPoint(Math.min(x + gridSize, width), y);
      lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }
  }

  // Generate vertical lines
  for (let x = 0; x <= width; x += gridSize) {
    for (let y = 0; y < height; y += gridSize) {
      const p1 = transformPoint(x, y);
      const p2 = transformPoint(x, Math.min(y + gridSize, height));
      lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }
  }

  return { lines };
}
