/**
 * StabilizeMotion - Preview 2D motion stabilization for shaky footage.
 *
 * Algorithm: block-matching motion estimation with:
 * - Downsampling for performance on large frames
 * - Textureless block exclusion
 * - MAD-based outlier rejection
 * - Scene-cut detection via confidence metric
 * - EMA smoothing on cumulative motion path
 * - Bilinear interpolation pixel shifting
 * - Border cropping
 *
 * This is preview-quality only, not production-grade.
 */

/** Parameters controlling stabilization behavior. */
export interface StabilizationParams {
  enabled: boolean;
  smoothingStrength: number; // 0–100 (0 = raw compensation, 100 = maximum smoothing)
  cropAmount: number; // 0–64 pixels of border cropping
}

/** Per-frame motion vector with reliability confidence. */
export interface MotionVector {
  dx: number; // horizontal displacement in pixels
  dy: number; // vertical displacement in pixels
  confidence: number; // 0–1 (0 = scene cut / unreliable, 1 = high confidence)
}

/** Parameters for per-frame stabilization application. */
export interface ApplyStabilizationParams {
  dx: number;
  dy: number;
  cropAmount: number;
}

export const DEFAULT_STABILIZATION_PARAMS: StabilizationParams = {
  enabled: false,
  smoothingStrength: 50,
  cropAmount: 8,
};

/**
 * Check if stabilization is enabled.
 */
export function isStabilizationActive(params: StabilizationParams): boolean {
  return params.enabled;
}

/**
 * Convert RGBA ImageData to grayscale luminance array using Rec.709 coefficients.
 */
export function toGrayscale(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    gray[i] = 0.2126 * data[idx]! + 0.7152 * data[idx + 1]! + 0.0722 * data[idx + 2]!;
  }
  return gray;
}

/**
 * Downsample a grayscale image by a given factor using nearest-neighbor.
 */
export function downsampleGrayscale(
  gray: Float32Array,
  w: number,
  h: number,
  factor: number,
): { data: Float32Array; width: number; height: number } {
  const nw = Math.floor(w / factor);
  const nh = Math.floor(h / factor);
  const out = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      out[y * nw + x] = gray[y * factor * w + x * factor]!;
    }
  }
  return { data: out, width: nw, height: nh };
}

/**
 * Compute the median of an array of numbers.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Filter outliers using MAD (Median Absolute Deviation).
 * Removes values whose deviation from the median exceeds threshold * MAD.
 */
export function filterOutliers(values: number[], threshold: number = 2.5): number[] {
  if (values.length < 3) return values;
  const med = median(values);
  const absDevs = values.map((v) => Math.abs(v - med));
  const mad = median(absDevs);
  if (mad < 1e-6) return values; // All values are essentially the same
  return values.filter((_, i) => absDevs[i]! / mad <= threshold);
}

/** Minimum block variance to be considered textured. */
const MIN_BLOCK_VARIANCE = 10;

/** Per-pixel SAD above this threshold indicates a scene cut. */
const SCENE_CUT_THRESHOLD = 40;

/**
 * Compute the global motion vector between two frames using block matching.
 *
 * Automatically downsamples large frames for performance.
 * Returns a confidence metric (0 = scene cut / unreliable, 1 = high confidence).
 */
export function computeMotionVector(
  current: ImageData,
  reference: ImageData,
  blockSize: number = 16,
  searchRadius: number = 32,
): MotionVector {
  const w = current.width;
  const h = current.height;

  // Mismatched dimensions
  if (w !== reference.width || h !== reference.height) {
    return { dx: 0, dy: 0, confidence: 0 };
  }

  // Too small
  if (w < blockSize || h < blockSize) {
    return { dx: 0, dy: 0, confidence: 0 };
  }

  // Convert to grayscale
  let curGray = toGrayscale(current.data, w, h);
  let refGray = toGrayscale(reference.data, w, h);
  let aw = w;
  let ah = h;

  // Downsample for performance when image is large (target ~256px on short side)
  const downsampleFactor = Math.max(1, Math.floor(Math.min(w, h) / 256));
  let effectiveBlockSize = blockSize;
  let effectiveSearchRadius = searchRadius;

  if (downsampleFactor > 1) {
    const curDown = downsampleGrayscale(curGray, w, h, downsampleFactor);
    const refDown = downsampleGrayscale(refGray, w, h, downsampleFactor);
    curGray = curDown.data;
    refGray = refDown.data;
    aw = curDown.width;
    ah = curDown.height;
    effectiveBlockSize = Math.max(4, Math.floor(blockSize / downsampleFactor));
    effectiveSearchRadius = Math.max(4, Math.floor(searchRadius / downsampleFactor));
  }

  // Collect per-block motion vectors
  const dxs: number[] = [];
  const dys: number[] = [];
  const sads: number[] = [];

  const blocksX = Math.floor((aw - 2 * effectiveSearchRadius) / effectiveBlockSize);
  const blocksY = Math.floor((ah - 2 * effectiveSearchRadius) / effectiveBlockSize);

  if (blocksX <= 0 || blocksY <= 0) {
    return { dx: 0, dy: 0, confidence: 0 };
  }

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const refX = effectiveSearchRadius + bx * effectiveBlockSize;
      const refY = effectiveSearchRadius + by * effectiveBlockSize;

      // Texture check: skip blocks with low variance
      let blockMean = 0;
      for (let dy = 0; dy < effectiveBlockSize; dy++) {
        for (let dx = 0; dx < effectiveBlockSize; dx++) {
          blockMean += refGray[(refY + dy) * aw + (refX + dx)]!;
        }
      }
      blockMean /= effectiveBlockSize * effectiveBlockSize;

      let blockVar = 0;
      for (let dy = 0; dy < effectiveBlockSize; dy++) {
        for (let dx = 0; dx < effectiveBlockSize; dx++) {
          const diff = refGray[(refY + dy) * aw + (refX + dx)]! - blockMean;
          blockVar += diff * diff;
        }
      }
      blockVar /= effectiveBlockSize * effectiveBlockSize;

      if (blockVar < MIN_BLOCK_VARIANCE) continue;

      // Search for best match using SAD
      let bestSAD = Infinity;
      let bestDx = 0;
      let bestDy = 0;

      for (let sy = -effectiveSearchRadius; sy <= effectiveSearchRadius; sy++) {
        for (let sx = -effectiveSearchRadius; sx <= effectiveSearchRadius; sx++) {
          let sad = 0;
          for (let py = 0; py < effectiveBlockSize; py++) {
            for (let px = 0; px < effectiveBlockSize; px++) {
              const refIdx = (refY + py) * aw + (refX + px);
              const curY = refY + py + sy;
              const curX = refX + px + sx;
              if (curY < 0 || curY >= ah || curX < 0 || curX >= aw) {
                sad += 255;
              } else {
                sad += Math.abs(refGray[refIdx]! - curGray[curY * aw + curX]!);
              }
            }
          }
          if (sad < bestSAD) {
            bestSAD = sad;
            bestDx = sx;
            bestDy = sy;
          }
        }
      }

      dxs.push(bestDx);
      dys.push(bestDy);
      sads.push(bestSAD / (effectiveBlockSize * effectiveBlockSize));
    }
  }

  if (dxs.length === 0) {
    return { dx: 0, dy: 0, confidence: 0 };
  }

  // MAD-based outlier rejection
  const filteredDxs = filterOutliers(dxs);
  const filteredDys = filterOutliers(dys);

  // Global motion = median of filtered vectors
  let globalDx = median(filteredDxs.length > 0 ? filteredDxs : dxs);
  let globalDy = median(filteredDys.length > 0 ? filteredDys : dys);

  // Scale back if downsampled
  if (downsampleFactor > 1) {
    globalDx *= downsampleFactor;
    globalDy *= downsampleFactor;
  }

  // Confidence: based on median per-pixel SAD
  // High SAD → scene cut / unreliable → low confidence
  const medianSAD = median(sads);
  const confidence = Math.max(0, Math.min(1, 1 - medianSAD / SCENE_CUT_THRESHOLD));

  return { dx: globalDx, dy: globalDy, confidence };
}

/**
 * Smooth a sequence of per-frame motion vectors using EMA on the cumulative path.
 *
 * Input: raw per-frame displacements V[i] = (dx, dy) from frame i-1 to frame i.
 * Output: correction vectors C[i] to apply to each frame for stabilization.
 *
 * Algorithm:
 * 1. Build cumulative path P[i] = sum(V[0..i])
 * 2. Smooth P using exponential moving average → S[i]
 * 3. Correction C[i] = S[i] - P[i]
 *
 * @param vectors - Raw per-frame motion vectors
 * @param strength - 0–100 (0 = no smoothing / returns zero corrections, 100 = maximum smoothing)
 */
export function smoothMotionPath(
  vectors: MotionVector[],
  strength: number,
): MotionVector[] {
  if (vectors.length === 0) return [];
  if (vectors.length === 1) return [{ dx: 0, dy: 0, confidence: vectors[0]!.confidence }];
  if (strength <= 0) return vectors.map((v) => ({ dx: 0, dy: 0, confidence: v.confidence }));

  // Build cumulative path: P[0] = (0,0), P[i+1] = P[i] + V[i]
  const cumX: number[] = new Array(vectors.length + 1);
  const cumY: number[] = new Array(vectors.length + 1);
  cumX[0] = 0;
  cumY[0] = 0;
  for (let i = 0; i < vectors.length; i++) {
    cumX[i + 1] = cumX[i]! + vectors[i]!.dx;
    cumY[i + 1] = cumY[i]! + vectors[i]!.dy;
  }

  // EMA smoothing: alpha = 1 - strength/100 (higher strength → lower alpha → more smoothing)
  const alpha = Math.max(0.01, 1 - Math.min(0.99, strength / 100));

  // Forward pass EMA
  const smoothX: number[] = new Array(cumX.length);
  const smoothY: number[] = new Array(cumY.length);
  smoothX[0] = cumX[0]!;
  smoothY[0] = cumY[0]!;
  for (let i = 1; i < cumX.length; i++) {
    smoothX[i] = alpha * cumX[i]! + (1 - alpha) * smoothX[i - 1]!;
    smoothY[i] = alpha * cumY[i]! + (1 - alpha) * smoothY[i - 1]!;
  }

  // Correction: C[i] = S[i+1] - P[i+1]
  const result: MotionVector[] = [];
  for (let i = 0; i < vectors.length; i++) {
    result.push({
      dx: smoothX[i + 1]! - cumX[i + 1]!,
      dy: smoothY[i + 1]! - cumY[i + 1]!,
      confidence: vectors[i]!.confidence,
    });
  }

  return result;
}

/**
 * Apply stabilization to ImageData in-place: shift pixels and crop borders.
 */
export function applyStabilization(
  imageData: ImageData,
  params: ApplyStabilizationParams,
): void {
  const { data, width, height } = imageData;
  const { dx, dy, cropAmount } = params;

  // If no shift and no crop, skip
  if (dx === 0 && dy === 0 && cropAmount <= 0) return;

  // Apply pixel shift with bilinear interpolation
  if (dx !== 0 || dy !== 0) {
    const temp = new Uint8ClampedArray(data.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcX = x + dx;
        const srcY = y + dy;

        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const fx = srcX - x0;
        const fy = srcY - y0;

        const dstIdx = (y * width + x) * 4;

        if (x0 < 0 || x0 >= width - 1 || y0 < 0 || y0 >= height - 1) {
          // Out of bounds — black with full alpha
          temp[dstIdx] = 0;
          temp[dstIdx + 1] = 0;
          temp[dstIdx + 2] = 0;
          temp[dstIdx + 3] = 255;
        } else {
          const i00 = (y0 * width + x0) * 4;
          const i10 = (y0 * width + x0 + 1) * 4;
          const i01 = ((y0 + 1) * width + x0) * 4;
          const i11 = ((y0 + 1) * width + x0 + 1) * 4;

          for (let c = 0; c < 4; c++) {
            const v00 = data[i00 + c]!;
            const v10 = data[i10 + c]!;
            const v01 = data[i01 + c]!;
            const v11 = data[i11 + c]!;

            temp[dstIdx + c] = Math.round(
              v00 * (1 - fx) * (1 - fy) +
                v10 * fx * (1 - fy) +
                v01 * (1 - fx) * fy +
                v11 * fx * fy,
            );
          }
        }
      }
    }

    data.set(temp);
  }

  // Apply crop (black out edges)
  if (cropAmount > 0) {
    applyCrop(data, width, height, cropAmount);
  }
}

/**
 * Black out pixels within cropAmount of each edge.
 */
function applyCrop(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cropAmount: number,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (
        x < cropAmount ||
        x >= width - cropAmount ||
        y < cropAmount ||
        y >= height - cropAmount
      ) {
        const idx = (y * width + x) * 4;
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 255;
      }
    }
  }
}
