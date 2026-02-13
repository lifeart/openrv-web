/**
 * Deinterlace - Preview deinterlacing for interlaced video sources
 *
 * Supports bob (field interpolation), weave (identity/no-op), and blend
 * (adjacent line averaging) methods with field order selection.
 */

import { luminanceRec709 } from '../color/PixelMath';

export type DeinterlaceMethod = 'bob' | 'weave' | 'blend';
export type FieldOrder = 'tff' | 'bff';

export interface DeinterlaceParams {
  method: DeinterlaceMethod;
  fieldOrder: FieldOrder;
  enabled: boolean;
}

export const DEFAULT_DEINTERLACE_PARAMS: DeinterlaceParams = {
  method: 'bob',
  fieldOrder: 'tff',
  enabled: false,
};

/**
 * Check if deinterlacing would actually modify pixels.
 * Weave is a no-op (shows raw fields as-is).
 */
export function isDeinterlaceActive(params: DeinterlaceParams): boolean {
  return params.enabled && params.method !== 'weave';
}

/**
 * Apply deinterlacing to ImageData in-place.
 */
export function applyDeinterlace(
  imageData: ImageData,
  params: DeinterlaceParams
): void {
  if (!params.enabled) return;
  if (params.method === 'weave') return;

  const { data, width, height } = imageData;

  if (params.method === 'bob') {
    applyBob(data, width, height, params.fieldOrder);
  } else if (params.method === 'blend') {
    applyBlend(data, width, height);
  }
}

/**
 * Bob deinterlace: keep one field, interpolate the other.
 * TFF keeps even lines (0,2,4...) and interpolates odd lines.
 * BFF keeps odd lines (1,3,5...) and interpolates even lines.
 */
function applyBob(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  fieldOrder: FieldOrder
): void {
  const original = new Uint8ClampedArray(data);
  const stride = width * 4;

  // Determine which lines to interpolate
  // TFF: even lines are the kept field, odd lines are interpolated
  // BFF: odd lines are the kept field, even lines are interpolated
  const interpolateEven = fieldOrder === 'bff';

  for (let y = 0; y < height; y++) {
    const isEvenLine = y % 2 === 0;
    const shouldInterpolate = interpolateEven ? isEvenLine : !isEvenLine;

    if (!shouldInterpolate) continue;

    const rowOffset = y * stride;

    if (y === 0) {
      // First line: copy from line below
      const belowOffset = 1 * stride;
      for (let i = 0; i < stride; i++) {
        data[rowOffset + i] = original[belowOffset + i]!;
      }
    } else if (y === height - 1) {
      // Last line: copy from line above
      const aboveOffset = (height - 2) * stride;
      for (let i = 0; i < stride; i++) {
        data[rowOffset + i] = original[aboveOffset + i]!;
      }
    } else {
      // Interior line: average neighbors above and below
      const aboveOffset = (y - 1) * stride;
      const belowOffset = (y + 1) * stride;
      for (let i = 0; i < stride; i++) {
        data[rowOffset + i] = (original[aboveOffset + i]! + original[belowOffset + i]!) >> 1;
      }
    }
  }
}

/**
 * Blend deinterlace: average each line with its adjacent neighbor.
 * Even lines average with the line below, odd lines with the line above.
 * Reduces combing but softens the image.
 */
function applyBlend(
  data: Uint8ClampedArray,
  width: number,
  height: number
): void {
  const original = new Uint8ClampedArray(data);
  const stride = width * 4;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * stride;

    // Pick the neighbor to blend with
    const neighborY = y % 2 === 0
      ? Math.min(y + 1, height - 1)
      : Math.max(y - 1, 0);
    const neighborOffset = neighborY * stride;

    for (let i = 0; i < stride; i++) {
      data[rowOffset + i] = (original[rowOffset + i]! + original[neighborOffset + i]!) >> 1;
    }
  }
}

/**
 * Detect whether an image appears to be interlaced by computing a comb metric.
 *
 * Measures average absolute luminance difference between adjacent scanlines
 * in the center region of the image. Interlaced content with motion will
 * show high inter-line luminance differences in an alternating pattern.
 */
export function detectInterlacing(imageData: ImageData): {
  isInterlaced: boolean;
  combMetric: number;
} {
  const { data, width, height } = imageData;

  if (height < 4) {
    return { isInterlaced: false, combMetric: 0 };
  }

  // Sample center region to avoid letterboxing
  const marginX = Math.floor(width * 0.1);
  const marginY = Math.floor(height * 0.1);
  const startX = marginX;
  const endX = width - marginX;
  const startY = Math.max(1, marginY);
  const endY = height - marginY - 1;

  if (startX >= endX || startY >= endY) {
    return { isInterlaced: false, combMetric: 0 };
  }

  let combSum = 0;
  let sampleCount = 0;

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const idx = (y * width + x) * 4;
      const idxAbove = ((y - 1) * width + x) * 4;
      const idxBelow = ((y + 1) * width + x) * 4;

      const lumaCur = luminanceRec709(data[idx]!, data[idx + 1]!, data[idx + 2]!);
      const lumaAbove = luminanceRec709(data[idxAbove]!, data[idxAbove + 1]!, data[idxAbove + 2]!);
      const lumaBelow = luminanceRec709(data[idxBelow]!, data[idxBelow + 1]!, data[idxBelow + 2]!);

      // Comb metric: high when current line differs from both neighbors
      // (characteristic of interlacing with motion)
      const diff = Math.abs(lumaCur - lumaAbove) + Math.abs(lumaCur - lumaBelow);
      combSum += diff;
      sampleCount++;
    }
  }

  const combMetric = sampleCount > 0 ? combSum / sampleCount : 0;

  // Threshold: empirically, interlaced content with motion shows
  // comb metrics significantly above progressive content
  const COMB_THRESHOLD = 30;

  return {
    isInterlaced: combMetric > COMB_THRESHOLD,
    combMetric,
  };
}
