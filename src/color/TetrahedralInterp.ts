/**
 * Tetrahedral Interpolation for 3D LUTs
 *
 * Tetrahedral interpolation divides each cube cell into 6 tetrahedra and
 * interpolates using only 4 vertices (vs 8 for trilinear). This provides
 * better accuracy especially at low LUT resolutions, as it avoids the
 * "cross-term" artifacts of trilinear interpolation.
 *
 * Algorithm reference: "Tetrahedral Interpolation for Color Space Conversion"
 * (see Kasson & Plouffe, 1992; also used in ICC profile processing)
 */

import type { LUT3D } from './LUTLoader';
import { applyLUT3D } from './LUTLoader';

/**
 * Apply a 3D LUT to a single color using tetrahedral interpolation.
 *
 * The cube cell containing the input point is divided into 6 tetrahedra
 * based on the relative ordering of the fractional r, g, b offsets.
 * The input point is then interpolated from the 4 vertices of the
 * tetrahedron it falls within.
 */
export function applyLUT3DTetrahedral(
  lut: LUT3D,
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const { size, domainMin, domainMax, data } = lut;

  // Normalize input to 0-1 range based on domain
  // Guard against zero-width domain (domainMin === domainMax)
  const rangeR = domainMax[0] - domainMin[0];
  const rangeG = domainMax[1] - domainMin[1];
  const rangeB = domainMax[2] - domainMin[2];
  const nr = rangeR === 0 ? 0 : (r - domainMin[0]) / rangeR;
  const ng = rangeG === 0 ? 0 : (g - domainMin[1]) / rangeG;
  const nb = rangeB === 0 ? 0 : (b - domainMin[2]) / rangeB;

  // Clamp and scale to LUT indices
  const maxIdx = size - 1;
  const ri = Math.max(0, Math.min(maxIdx, nr * maxIdx));
  const gi = Math.max(0, Math.min(maxIdx, ng * maxIdx));
  const bi = Math.max(0, Math.min(maxIdx, nb * maxIdx));

  // Get integer and fractional parts
  const r0 = Math.floor(ri);
  const g0 = Math.floor(gi);
  const b0 = Math.floor(bi);
  const r1 = Math.min(r0 + 1, maxIdx);
  const g1 = Math.min(g0 + 1, maxIdx);
  const b1 = Math.min(b0 + 1, maxIdx);

  const fr = ri - r0;
  const fg = gi - g0;
  const fb = bi - b0;

  // Helper to read a color from the LUT data
  const getColor = (ri: number, gi: number, bi: number): [number, number, number] => {
    const idx = (ri * size * size + gi * size + bi) * 3;
    return [data[idx]!, data[idx + 1]!, data[idx + 2]!];
  };

  // Get the base vertex (r0, g0, b0) and opposite vertex (r1, g1, b1)
  const c000 = getColor(r0, g0, b0);
  const c111 = getColor(r1, g1, b1);

  // Determine which tetrahedron the point falls in based on the
  // relative ordering of fr, fg, fb. There are 6 possible orderings
  // (3! = 6), each corresponding to a different tetrahedron.
  //
  // Each tetrahedron shares vertices c000 and c111, plus two
  // intermediate vertices determined by the ordering.

  let c1: [number, number, number];
  let c2: [number, number, number];
  let w0: number, w1: number, w2: number, w3: number;

  if (fr >= fg && fg >= fb) {
    // fr >= fg >= fb: tetrahedron 1
    c1 = getColor(r1, g0, b0);
    c2 = getColor(r1, g1, b0);
    w0 = 1 - fr;
    w1 = fr - fg;
    w2 = fg - fb;
    w3 = fb;
  } else if (fr >= fb && fb >= fg) {
    // fr >= fb >= fg: tetrahedron 2
    c1 = getColor(r1, g0, b0);
    c2 = getColor(r1, g0, b1);
    w0 = 1 - fr;
    w1 = fr - fb;
    w2 = fb - fg;
    w3 = fg;
  } else if (fb >= fr && fr >= fg) {
    // fb >= fr >= fg: tetrahedron 3
    c1 = getColor(r0, g0, b1);
    c2 = getColor(r1, g0, b1);
    w0 = 1 - fb;
    w1 = fb - fr;
    w2 = fr - fg;
    w3 = fg;
  } else if (fg >= fr && fr >= fb) {
    // fg >= fr >= fb: tetrahedron 4
    c1 = getColor(r0, g1, b0);
    c2 = getColor(r1, g1, b0);
    w0 = 1 - fg;
    w1 = fg - fr;
    w2 = fr - fb;
    w3 = fb;
  } else if (fg >= fb && fb >= fr) {
    // fg >= fb >= fr: tetrahedron 5
    c1 = getColor(r0, g1, b0);
    c2 = getColor(r0, g1, b1);
    w0 = 1 - fg;
    w1 = fg - fb;
    w2 = fb - fr;
    w3 = fr;
  } else {
    // fb >= fg >= fr: tetrahedron 6
    c1 = getColor(r0, g0, b1);
    c2 = getColor(r0, g1, b1);
    w0 = 1 - fb;
    w1 = fb - fg;
    w2 = fg - fr;
    w3 = fr;
  }

  // Barycentric interpolation: output = w0*c000 + w1*c1 + w2*c2 + w3*c111
  const out: [number, number, number] = [
    w0 * c000[0] + w1 * c1[0] + w2 * c2[0] + w3 * c111[0],
    w0 * c000[1] + w1 * c1[1] + w2 * c2[1] + w3 * c111[1],
    w0 * c000[2] + w1 * c1[2] + w2 * c2[2] + w3 * c111[2],
  ];

  return out;
}

/**
 * Interpolation method selection
 */
export type InterpolationMethod = 'trilinear' | 'tetrahedral';

/**
 * Apply a 3D LUT to an image buffer (Float32Array, RGBA interleaved)
 * using the specified interpolation method.
 *
 * @param data - RGBA interleaved Float32Array (values in [0,1] or extended range)
 * @param width - Image width (for reference, not used in computation)
 * @param height - Image height (for reference, not used in computation)
 * @param lut - The 3D LUT to apply
 * @param method - Interpolation method ('trilinear' or 'tetrahedral')
 * @returns New Float32Array with LUT applied
 */
export function applyLUT3DToBuffer(
  data: Float32Array,
  width: number,
  height: number,
  lut: LUT3D,
  method: InterpolationMethod = 'tetrahedral'
): Float32Array {
  const output = new Float32Array(data.length);

  const applyFn = method === 'tetrahedral' ? applyLUT3DTetrahedral : applyLUT3D;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;

    const [outR, outG, outB] = applyFn(lut, r, g, b);

    output[i] = outR;
    output[i + 1] = outG;
    output[i + 2] = outB;
    output[i + 3] = a;
  }

  return output;
}

/**
 * Compare trilinear vs tetrahedral interpolation for a given LUT and input color.
 * Returns the absolute difference per channel.
 */
export function compareInterpolationMethods(
  lut: LUT3D,
  r: number,
  g: number,
  b: number
): {
  trilinear: [number, number, number];
  tetrahedral: [number, number, number];
  difference: [number, number, number];
  maxDifference: number;
} {
  const trilinear = applyLUT3D(lut, r, g, b);
  const tetrahedral = applyLUT3DTetrahedral(lut, r, g, b);

  const difference: [number, number, number] = [
    Math.abs(trilinear[0] - tetrahedral[0]),
    Math.abs(trilinear[1] - tetrahedral[1]),
    Math.abs(trilinear[2] - tetrahedral[2]),
  ];

  return {
    trilinear,
    tetrahedral,
    difference,
    maxDifference: Math.max(difference[0], difference[1], difference[2]),
  };
}
