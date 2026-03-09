/**
 * Cross-ecosystem shader math reference implementations.
 *
 * Pure TypeScript ports of the GLSL functions from viewer.frag.glsl.
 * These serve as the "source of truth" for verifying mathematical
 * consistency between WebGL2 (GLSL), WebGPU (WGSL), and CPU (TS)
 * implementations.
 *
 * Every function here mirrors the shader math EXACTLY — same constants,
 * thresholds, and clamp behavior.
 */

// =============================================================================
// Rec. 709 luminance coefficients (matches GLSL `const vec3 LUMA`)
// =============================================================================

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

// =============================================================================
// Input EOTF functions (signal → linear)
// =============================================================================

/**
 * sRGB EOTF: sRGB signal → linear light
 * Port of GLSL `srgbEOTF(float x)` (line ~688)
 */
export function srgbEOTF(x: number): number {
  if (x <= 0.04045) {
    return x / 12.92;
  } else {
    return Math.pow((x + 0.055) / 1.055, 2.4);
  }
}

/**
 * Rec.709 EOTF: Rec.709 signal → linear light
 * Port of GLSL `rec709EOTF(float x)` (line ~697)
 */
export function rec709EOTF(x: number): number {
  if (x < 0.081) {
    return x / 4.5;
  } else {
    return Math.pow((x + 0.099) / 1.099, 1.0 / 0.45);
  }
}

/**
 * HLG OETF inverse: HLG signal → relative scene light (per-channel)
 * Port of GLSL `hlgOETFInverse(float e)` (line ~539)
 */
export function hlgOETFInverse(e: number): number {
  const a = 0.17883277;
  const b = 0.28466892; // 1.0 - 4.0 * a
  const c = 0.55991073; // 0.5 - a * ln(4.0 * a)
  if (e <= 0.5) {
    return (e * e) / 3.0;
  } else {
    return (Math.exp((e - c) / a) + b) / 12.0;
  }
}

/**
 * HLG signal → linear with OOTF (gamma 1.2 for 1000 cd/m²)
 * Port of GLSL `hlgToLinear(vec3 signal)` (line ~550)
 */
export function hlgToLinear(r: number, g: number, b: number): [number, number, number] {
  // Apply inverse OETF per channel
  const sr = hlgOETFInverse(r);
  const sg = hlgOETFInverse(g);
  const sb = hlgOETFInverse(b);
  // HLG OOTF: Lw = Ys^(gamma-1) * scene, where gamma ≈ 1.2
  const ys = sr * LUMA_R + sg * LUMA_G + sb * LUMA_B;
  const ootfGain = Math.pow(Math.max(ys, 1e-6), 0.2); // gamma - 1 = 0.2
  return [sr * ootfGain, sg * ootfGain, sb * ootfGain];
}

/**
 * PQ EOTF (per-channel): PQ signal → linear (normalized to 1.0 = 10000 cd/m²)
 * Port of GLSL `pqEOTF(float n)` (line ~565)
 */
export function pqEOTFChannel(n: number): number {
  const m1 = 0.1593017578125; // 2610/16384
  const m2 = 78.84375; // 2523/32 * 128
  const c1 = 0.8359375; // 3424/4096
  const c2 = 18.8515625; // 2413/128
  const c3 = 18.6875; // 2392/128

  const nm1 = Math.pow(Math.max(n, 0.0), 1.0 / m2);
  const num = Math.max(nm1 - c1, 0.0);
  const den = c2 - c3 * nm1;
  return Math.pow(num / Math.max(den, 1e-6), 1.0 / m1);
}

/**
 * SMPTE 240M EOTF: signal → linear
 * Port of GLSL `smpte240mEOTF(float v)` (line ~591)
 */
export function smpte240mEOTF(v: number): number {
  const threshold = 4.0 * 0.0228; // = 0.0912
  if (v < threshold) {
    return v / 4.0;
  } else {
    return Math.pow((v + 0.1115) / 1.1115, 1.0 / 0.45);
  }
}

// =============================================================================
// Display transfer functions (linear → display encoded)
// =============================================================================

/**
 * Linear → sRGB encoded (per-channel)
 * Port of GLSL `displayTransferSRGB(float c)` (line ~621)
 */
export function linearToSRGBChannel(c: number): number {
  if (c <= 0.0031308) return c * 12.92;
  return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
}

/**
 * Linear → Rec.709 encoded (per-channel)
 * Port of GLSL `displayTransferRec709(float c)` (line ~626)
 */
export function linearToRec709Channel(c: number): number {
  if (c < 0.018) return 4.5 * c;
  return 1.099 * Math.pow(c, 0.45) - 0.099;
}

// =============================================================================
// Luminance
// =============================================================================

/**
 * Rec.709 luminance
 * Port of GLSL `dot(color.rgb, LUMA)` (line ~1093)
 */
export function luminanceRec709(r: number, g: number, b: number): number {
  return LUMA_R * r + LUMA_G * g + LUMA_B * b;
}

// =============================================================================
// Color adjustments
// =============================================================================

/**
 * Per-channel exposure in stops (linear space)
 * Port of GLSL `color.rgb *= exp2(u_exposureRGB)` (line ~1074)
 */
export function applyExposure(
  r: number,
  g: number,
  b: number,
  expR: number,
  expG: number,
  expB: number,
): [number, number, number] {
  return [r * Math.pow(2, expR), g * Math.pow(2, expG), b * Math.pow(2, expB)];
}

/**
 * Contrast with pivot at 0.5 (per-channel)
 * Port of GLSL `(color.rgb - 0.5) * u_contrastRGB + 0.5` (line ~1090)
 */
export function applyContrast(val: number, contrast: number): number {
  return (val - 0.5) * contrast + 0.5;
}

/**
 * Brightness as additive offset
 * Port of GLSL `color.rgb += u_brightness` (line ~1087)
 */
export function applyBrightness(val: number, brightness: number): number {
  return val + brightness;
}

/**
 * Saturation (luminance-weighted)
 * Port of GLSL `mix(vec3(luma), color.rgb, u_saturation)` (line ~1093-1094)
 */
export function applySaturation(
  r: number,
  g: number,
  b: number,
  saturation: number,
): [number, number, number] {
  const luma = luminanceRec709(r, g, b);
  return [
    luma + (r - luma) * saturation,
    luma + (g - luma) * saturation,
    luma + (b - luma) * saturation,
  ];
}

/**
 * Temperature and tint shift
 * Port of GLSL `applyTemperature(vec3 color, float temp, float tint)` (line ~238)
 */
export function applyTemperature(
  r: number,
  g: number,
  b: number,
  temp: number,
  tint: number,
): [number, number, number] {
  const t = temp / 100.0;
  const gv = tint / 100.0;

  let outR = r + t * 0.1;
  let outB = b - t * 0.1;
  let outG = g + gv * 0.1;
  outR -= gv * 0.05;
  outB -= gv * 0.05;

  return [outR, outG, outB];
}

/**
 * Color inversion: 1.0 - value
 * Port of GLSL `u_invert` behavior
 */
export function applyColorInversion(r: number, g: number, b: number): [number, number, number] {
  return [1.0 - r, 1.0 - g, 1.0 - b];
}
