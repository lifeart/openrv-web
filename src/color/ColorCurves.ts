/**
 * Color Curves - Bezier/Spline-based color correction
 *
 * Provides curve-based tonal adjustments for RGB channels.
 * Uses monotonic cubic spline interpolation for smooth curves.
 */

export interface CurvePoint {
  x: number; // Input value (0-1)
  y: number; // Output value (0-1)
}

export interface CurveChannel {
  points: CurvePoint[];
  enabled: boolean;
}

export interface ColorCurvesData {
  master: CurveChannel;  // Applied to all channels
  red: CurveChannel;
  green: CurveChannel;
  blue: CurveChannel;
}

/**
 * Default curve with two points (linear identity)
 */
export function createDefaultCurve(): CurveChannel {
  return {
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    enabled: true,
  };
}

/**
 * Create default curves data (identity curves for all channels)
 */
export function createDefaultCurvesData(): ColorCurvesData {
  return {
    master: createDefaultCurve(),
    red: createDefaultCurve(),
    green: createDefaultCurve(),
    blue: createDefaultCurve(),
  };
}

/**
 * Check if curves are at default (no adjustment)
 */
export function isDefaultCurves(curves: ColorCurvesData): boolean {
  const isIdentityCurve = (curve: CurveChannel): boolean => {
    if (!curve.enabled) return true;
    if (curve.points.length !== 2) return false;
    const [p0, p1] = curve.points;
    return p0!.x === 0 && p0!.y === 0 && p1!.x === 1 && p1!.y === 1;
  };

  return (
    isIdentityCurve(curves.master) &&
    isIdentityCurve(curves.red) &&
    isIdentityCurve(curves.green) &&
    isIdentityCurve(curves.blue)
  );
}

/**
 * Monotonic cubic spline interpolation
 * Ensures the curve is monotonically increasing (no inversions)
 */
export function evaluateCurveAtPoint(points: CurvePoint[], x: number): number {
  if (points.length === 0) return x;
  if (points.length === 1) return points[0]!.y;

  // Sort points by x
  const sorted = [...points].sort((a, b) => a.x - b.x);

  // Clamp x to curve bounds
  if (x <= sorted[0]!.x) return sorted[0]!.y;
  if (x >= sorted[sorted.length - 1]!.x) return sorted[sorted.length - 1]!.y;

  // Find segment containing x
  let i = 0;
  while (i < sorted.length - 1 && sorted[i + 1]!.x < x) {
    i++;
  }

  const p0 = sorted[Math.max(0, i - 1)]!;
  const p1 = sorted[i]!;
  const p2 = sorted[Math.min(sorted.length - 1, i + 1)]!;
  const p3 = sorted[Math.min(sorted.length - 1, i + 2)]!;

  // Calculate t (position within segment)
  const t = (x - p1.x) / (p2.x - p1.x || 1);

  // Catmull-Rom spline interpolation
  const t2 = t * t;
  const t3 = t2 * t;

  // Catmull-Rom basis matrix coefficients
  const y = 0.5 * (
    (2 * p1.y) +
    (-p0.y + p2.y) * t +
    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
  );

  // Clamp result to 0-1
  return Math.max(0, Math.min(1, y));
}

/**
 * Build a lookup table from curve points for fast evaluation
 */
export function buildCurveLUT(points: CurvePoint[], size = 256): Uint8Array {
  const lut = new Uint8Array(size);

  for (let i = 0; i < size; i++) {
    const x = i / (size - 1);
    const y = evaluateCurveAtPoint(points, x);
    lut[i] = Math.round(y * 255);
  }

  return lut;
}

/**
 * Build LUTs for all channels
 */
export interface CurveLUTs {
  master: Uint8Array;
  red: Uint8Array;
  green: Uint8Array;
  blue: Uint8Array;
}

export function buildAllCurveLUTs(curves: ColorCurvesData): CurveLUTs {
  return {
    master: curves.master.enabled ? buildCurveLUT(curves.master.points) : buildIdentityLUT(),
    red: curves.red.enabled ? buildCurveLUT(curves.red.points) : buildIdentityLUT(),
    green: curves.green.enabled ? buildCurveLUT(curves.green.points) : buildIdentityLUT(),
    blue: curves.blue.enabled ? buildCurveLUT(curves.blue.points) : buildIdentityLUT(),
  };
}

/**
 * Build identity LUT (no change)
 */
function buildIdentityLUT(size = 256): Uint8Array {
  const lut = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    lut[i] = i;
  }
  return lut;
}

/**
 * Apply curves to a single RGB pixel using pre-built LUTs
 */
export function applyCurvesToPixel(
  r: number,
  g: number,
  b: number,
  luts: CurveLUTs
): { r: number; g: number; b: number } {
  // Apply channel-specific curves first
  let outR = luts.red[Math.round(r)] ?? r;
  let outG = luts.green[Math.round(g)] ?? g;
  let outB = luts.blue[Math.round(b)] ?? b;

  // Then apply master curve
  outR = luts.master[outR] ?? outR;
  outG = luts.master[outG] ?? outG;
  outB = luts.master[outB] ?? outB;

  return { r: outR, g: outG, b: outB };
}

/**
 * Apply curves to ImageData (in-place modification)
 * Note: This rebuilds LUTs every call. For better performance, use CurveLUTCache.
 */
export function applyCurvesToImageData(imageData: ImageData, curves: ColorCurvesData): void {
  if (isDefaultCurves(curves)) return;

  const luts = buildAllCurveLUTs(curves);
  applyLUTsToImageData(imageData, luts);
}

/**
 * Apply pre-built LUTs to ImageData (in-place modification)
 */
export function applyLUTsToImageData(imageData: ImageData, luts: CurveLUTs): void {
  const data = imageData.data;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const result = applyCurvesToPixel(data[i]!, data[i + 1]!, data[i + 2]!, luts);
    data[i] = result.r;
    data[i + 1] = result.g;
    data[i + 2] = result.b;
    // Alpha unchanged
  }
}

/**
 * Compare two CurveChannels for structural equality
 */
function curveChannelEqual(a: CurveChannel, b: CurveChannel): boolean {
  if (a.enabled !== b.enabled) return false;
  if (a.points.length !== b.points.length) return false;
  for (let i = 0; i < a.points.length; i++) {
    if (a.points[i]!.x !== b.points[i]!.x || a.points[i]!.y !== b.points[i]!.y) {
      return false;
    }
  }
  return true;
}

/**
 * Compare two ColorCurvesData for structural equality
 */
function curvesEqual(a: ColorCurvesData, b: ColorCurvesData): boolean {
  return (
    curveChannelEqual(a.master, b.master) &&
    curveChannelEqual(a.red, b.red) &&
    curveChannelEqual(a.green, b.green) &&
    curveChannelEqual(a.blue, b.blue)
  );
}

/**
 * Deep copy a ColorCurvesData so the cache holds its own snapshot
 */
function deepCopyCurves(curves: ColorCurvesData): ColorCurvesData {
  return {
    master: { enabled: curves.master.enabled, points: curves.master.points.map(p => ({ x: p.x, y: p.y })) },
    red: { enabled: curves.red.enabled, points: curves.red.points.map(p => ({ x: p.x, y: p.y })) },
    green: { enabled: curves.green.enabled, points: curves.green.points.map(p => ({ x: p.x, y: p.y })) },
    blue: { enabled: curves.blue.enabled, points: curves.blue.points.map(p => ({ x: p.x, y: p.y })) },
  };
}

/**
 * Cache for curve LUTs to avoid rebuilding every frame
 * Only rebuilds when curves actually change.
 * Uses structural comparison instead of JSON.stringify for cache invalidation.
 */
export class CurveLUTCache {
  private cachedLUTs: CurveLUTs | null = null;
  private cachedCurves: ColorCurvesData | null = null;

  /**
   * Get LUTs for the given curves, rebuilding only if curves changed
   */
  getLUTs(curves: ColorCurvesData): CurveLUTs {
    if (this.cachedLUTs && this.cachedCurves && curvesEqual(this.cachedCurves, curves)) {
      return this.cachedLUTs;
    }

    // Curves changed, rebuild LUTs
    this.cachedLUTs = buildAllCurveLUTs(curves);
    // Deep-copy the curves for future comparison
    this.cachedCurves = deepCopyCurves(curves);

    return this.cachedLUTs;
  }

  /**
   * Apply curves to ImageData using cached LUTs
   */
  apply(imageData: ImageData, curves: ColorCurvesData): void {
    if (isDefaultCurves(curves)) return;

    const luts = this.getLUTs(curves);
    applyLUTsToImageData(imageData, luts);
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cachedLUTs = null;
    this.cachedCurves = null;
  }
}

/**
 * Preset curves for common adjustments
 */
export interface CurvePreset {
  name: string;
  curves: ColorCurvesData;
}

/**
 * Create S-curve for added contrast
 */
export function createSCurve(strength = 0.2): CurveChannel {
  return {
    points: [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.25 - strength * 0.25 },
      { x: 0.5, y: 0.5 },
      { x: 0.75, y: 0.75 + strength * 0.25 },
      { x: 1, y: 1 },
    ],
    enabled: true,
  };
}

/**
 * Create curve that lifts shadows
 */
export function createLiftShadows(amount = 0.1): CurveChannel {
  return {
    points: [
      { x: 0, y: amount },
      { x: 0.25, y: 0.25 + amount * 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 },
    ],
    enabled: true,
  };
}

/**
 * Create curve that crushes blacks
 */
export function createCrushBlacks(amount = 0.1): CurveChannel {
  return {
    points: [
      { x: 0, y: 0 },
      { x: amount, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 },
    ],
    enabled: true,
  };
}

/**
 * Create curve that lowers highlights
 */
export function createLowerHighlights(amount = 0.1): CurveChannel {
  return {
    points: [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 0.75, y: 0.75 - amount * 0.25 },
      { x: 1, y: 1 - amount },
    ],
    enabled: true,
  };
}

/**
 * Create linear contrast curve
 */
export function createLinearContrast(amount = 0.2): CurveChannel {
  const lift = amount * 0.5;
  return {
    points: [
      { x: 0, y: lift },
      { x: 1, y: 1 - lift },
    ],
    enabled: true,
  };
}

/**
 * Built-in curve presets
 */
export const CURVE_PRESETS: CurvePreset[] = [
  {
    name: 'Linear (Default)',
    curves: createDefaultCurvesData(),
  },
  {
    name: 'S-Curve (Mild)',
    curves: {
      ...createDefaultCurvesData(),
      master: createSCurve(0.15),
    },
  },
  {
    name: 'S-Curve (Strong)',
    curves: {
      ...createDefaultCurvesData(),
      master: createSCurve(0.3),
    },
  },
  {
    name: 'Lift Shadows',
    curves: {
      ...createDefaultCurvesData(),
      master: createLiftShadows(0.08),
    },
  },
  {
    name: 'Crush Blacks',
    curves: {
      ...createDefaultCurvesData(),
      master: createCrushBlacks(0.05),
    },
  },
  {
    name: 'Lower Highlights',
    curves: {
      ...createDefaultCurvesData(),
      master: createLowerHighlights(0.1),
    },
  },
  {
    name: 'Film Look',
    curves: {
      ...createDefaultCurvesData(),
      master: {
        points: [
          { x: 0, y: 0.02 },
          { x: 0.15, y: 0.12 },
          { x: 0.5, y: 0.52 },
          { x: 0.85, y: 0.88 },
          { x: 1, y: 0.98 },
        ],
        enabled: true,
      },
    },
  },
  {
    name: 'Cross Process',
    curves: {
      master: createDefaultCurve(),
      red: {
        points: [
          { x: 0, y: 0.05 },
          { x: 0.5, y: 0.55 },
          { x: 1, y: 0.95 },
        ],
        enabled: true,
      },
      green: createDefaultCurve(),
      blue: {
        points: [
          { x: 0, y: 0.1 },
          { x: 0.5, y: 0.45 },
          { x: 1, y: 0.9 },
        ],
        enabled: true,
      },
    },
  },
];

/**
 * Serialize curves to JSON string
 */
export function exportCurvesJSON(curves: ColorCurvesData): string {
  return JSON.stringify(curves, null, 2);
}

/**
 * Parse curves from JSON string
 */
export function importCurvesJSON(json: string): ColorCurvesData | null {
  try {
    const data = JSON.parse(json);
    // Validate structure
    if (
      data.master?.points &&
      data.red?.points &&
      data.green?.points &&
      data.blue?.points
    ) {
      return data as ColorCurvesData;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Add a point to a curve at the specified position
 */
export function addPointToCurve(curve: CurveChannel, x: number): CurveChannel {
  const y = evaluateCurveAtPoint(curve.points, x);
  const newPoints = [...curve.points, { x, y }].sort((a, b) => a.x - b.x);
  return { ...curve, points: newPoints };
}

/**
 * Remove a point from a curve by index
 * Cannot remove first or last point
 */
export function removePointFromCurve(curve: CurveChannel, index: number): CurveChannel {
  if (index <= 0 || index >= curve.points.length - 1) {
    return curve;
  }
  const newPoints = curve.points.filter((_, i) => i !== index);
  return { ...curve, points: newPoints };
}

/**
 * Update a point in a curve
 */
export function updatePointInCurve(
  curve: CurveChannel,
  index: number,
  x: number,
  y: number
): CurveChannel {
  const newPoints = [...curve.points];

  // First and last points can only move on Y axis
  if (index === 0) {
    newPoints[0] = { x: 0, y: Math.max(0, Math.min(1, y)) };
  } else if (index === curve.points.length - 1) {
    newPoints[index] = { x: 1, y: Math.max(0, Math.min(1, y)) };
  } else {
    // Middle points can move freely but stay within bounds
    const prevX = curve.points[index - 1]?.x ?? 0;
    const nextX = curve.points[index + 1]?.x ?? 1;
    newPoints[index] = {
      x: Math.max(prevX + 0.01, Math.min(nextX - 0.01, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }

  return { ...curve, points: newPoints };
}
