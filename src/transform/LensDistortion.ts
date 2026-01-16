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
  // Center offset (normalized, 0 = center)
  centerX: number;  // -0.5 to 0.5
  centerY: number;  // -0.5 to 0.5
  // Scale to compensate for distortion cropping
  scale: number;  // 0.5 to 2.0
}

export const DEFAULT_LENS_PARAMS: LensDistortionParams = {
  k1: 0,
  k2: 0,
  centerX: 0,
  centerY: 0,
  scale: 1,
};

/**
 * Check if lens parameters are at defaults (no correction)
 */
export function isDefaultLensParams(params: LensDistortionParams): boolean {
  return (
    params.k1 === 0 &&
    params.k2 === 0 &&
    params.centerX === 0 &&
    params.centerY === 0 &&
    params.scale === 1
  );
}

/**
 * Apply inverse radial distortion to get source coordinates
 * Given a destination point, find where it came from in the source
 */
function undistortPoint(
  dx: number,  // Destination x (normalized -1 to 1)
  dy: number,  // Destination y (normalized -1 to 1)
  k1: number,
  k2: number
): { x: number; y: number } {
  const r2 = dx * dx + dy * dy;
  const r4 = r2 * r2;

  // Radial distortion factor
  const radialFactor = 1 + k1 * r2 + k2 * r4;

  return {
    x: dx * radialFactor,
    y: dy * radialFactor,
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

  const { k1, k2, centerX, centerY, scale } = params;
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
      // Normalize coordinates to -1 to 1 range (accounting for aspect ratio)
      let nx = ((dx - cx) / maxDim) * 2 * scale;
      let ny = ((dy - cy) / maxDim) * 2 * scale;

      // Apply inverse distortion to find source coordinates
      const undistorted = undistortPoint(nx, ny, k1, k2);

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
  const { k1, k2, centerX, centerY, scale } = params;

  const cx = width / 2 + centerX * width;
  const cy = height / 2 + centerY * height;
  const maxDim = Math.max(width, height);

  // Helper to transform a point
  const transformPoint = (px: number, py: number): { x: number; y: number } => {
    let nx = ((px - cx) / maxDim) * 2 * scale;
    let ny = ((py - cy) / maxDim) * 2 * scale;
    const undist = undistortPoint(nx, ny, k1, k2);
    return {
      x: undist.x * maxDim / 2 + cx,
      y: undist.y * maxDim / 2 + cy,
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
