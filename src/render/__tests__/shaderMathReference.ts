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
// HLG OOTF near-black threshold and linear-ramp slope.
// Below OOTF_THRESH, the power curve ys^0.2 is replaced by a linear ramp
// (ys * OOTF_SLOPE) to avoid extreme gain amplification of shadow noise.
// The ramp is C0-continuous at the threshold: OOTF_THRESH * OOTF_SLOPE === OOTF_THRESH^0.2.
const OOTF_THRESH = 0.01;
const OOTF_SLOPE = 39.810717; // OOTF_THRESH^(-0.8) = 10^1.6

export function hlgToLinear(r: number, g: number, b: number): [number, number, number] {
  // Apply inverse OETF per channel
  const sr = hlgOETFInverse(r);
  const sg = hlgOETFInverse(g);
  const sb = hlgOETFInverse(b);
  // HLG OOTF: Lw = Ys^(gamma-1) * scene, where gamma ≈ 1.2
  // Linear ramp below threshold to bound near-black gain.
  const ys = sr * LUMA_R + sg * LUMA_G + sb * LUMA_B;
  const ootfGain = ys < OOTF_THRESH ? ys * OOTF_SLOPE : Math.pow(ys, 0.2);
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
export function applySaturation(r: number, g: number, b: number, saturation: number): [number, number, number] {
  const luma = luminanceRec709(r, g, b);
  return [luma + (r - luma) * saturation, luma + (g - luma) * saturation, luma + (b - luma) * saturation];
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
  const outG = g + gv * 0.1;
  outR -= gv * 0.05;
  outB -= gv * 0.05;

  // Clamp negative values (matches GLSL: max(color, 0.0))
  // Negative color is physically meaningless; HDR values > 1.0 are preserved.
  return [Math.max(outR, 0), Math.max(outG, 0), Math.max(outB, 0)];
}

/**
 * Color inversion: 1.0 - value
 * Port of GLSL `u_invert` behavior
 */
export function applyColorInversion(r: number, g: number, b: number): [number, number, number] {
  return [1.0 - r, 1.0 - g, 1.0 - b];
}

// =============================================================================
// HSL conversions (needed by vibrance)
// =============================================================================

/**
 * RGB to HSL conversion
 * Port of GLSL `rgbToHsl(vec3 c)` (line ~789)
 * Returns [h (0-360), s (0-1), l (0-1)]
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const l = (maxC + minC) * 0.5;
  const delta = maxC - minC;

  if (delta < 0.00001) {
    return [0.0, 0.0, l];
  }

  const s = l > 0.5 ? delta / (2.0 - maxC - minC) : delta / (maxC + minC);

  let h: number;
  if (maxC === r) {
    h = ((g - b) / delta) % 6.0;
    if (h < 0) h += 6.0;
  } else if (maxC === g) {
    h = (b - r) / delta + 2.0;
  } else {
    h = (r - g) / delta + 4.0;
  }
  h *= 60.0;

  return [h, s, l];
}

/**
 * HSL to RGB helper
 * Port of GLSL `hueToRgb(float p, float q, float t)` (line ~815)
 */
function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0.0) tt += 1.0;
  if (tt > 1.0) tt -= 1.0;
  if (tt < 1.0 / 6.0) return p + (q - p) * 6.0 * tt;
  if (tt < 0.5) return q;
  if (tt < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - tt) * 6.0;
  return p;
}

/**
 * HSL to RGB conversion
 * Port of GLSL `hslToRgb(float h, float s, float l)` (line ~826)
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s < 0.00001) {
    return [l, l, l];
  }

  const q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  const p = 2.0 * l - q;
  const hNorm = h / 360.0;

  return [hueToRgb(p, q, hNorm + 1.0 / 3.0), hueToRgb(p, q, hNorm), hueToRgb(p, q, hNorm - 1.0 / 3.0)];
}

// =============================================================================
// GLSL smoothstep helper
// =============================================================================

/**
 * GLSL smoothstep: Hermite interpolation between edge0 and edge1
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}

// =============================================================================
// Highlights / Shadows / Whites / Blacks
// =============================================================================

/**
 * Highlights/Shadows/Whites/Blacks adjustment
 * Port of GLSL section 5b (lines ~1098-1126)
 *
 * Uses smoothstep-based luminance masks for highlight/shadow regions.
 * GLSL uses u_hdrHeadroom for HDR scaling; WGSL hardcodes hsPeak=1.0.
 *
 * @param hdrHeadroom - Peak luminance multiplier (1.0 for SDR, >1.0 for HDR).
 *                      WGSL always uses 1.0 (SDR pipeline stage).
 */
export function applyHighlightsShadows(
  r: number,
  g: number,
  b: number,
  highlights: number,
  shadows: number,
  whites: number,
  blacks: number,
  hdrHeadroom: number = 1.0,
): [number, number, number] {
  const hsPeak = Math.max(hdrHeadroom, 1.0);

  let outR = r;
  let outG = g;
  let outB = b;

  // Whites/Blacks clipping (scaled to HDR range)
  if (whites !== 0.0 || blacks !== 0.0) {
    const whitePoint = hsPeak * (1.0 - whites * (55.0 / 255.0));
    const blackPoint = hsPeak * blacks * (55.0 / 255.0);
    const range = whitePoint - blackPoint;
    if (range > 0.0) {
      outR = Math.max(0.0, Math.min(hsPeak, ((outR - blackPoint) / range) * hsPeak));
      outG = Math.max(0.0, Math.min(hsPeak, ((outG - blackPoint) / range) * hsPeak));
      outB = Math.max(0.0, Math.min(hsPeak, ((outB - blackPoint) / range) * hsPeak));
    }
  }

  // Luminance for highlight/shadow masks (normalized to 0-1 for masking)
  const hsLum = LUMA_R * outR + LUMA_G * outG + LUMA_B * outB;
  const hsLumNorm = hsLum / hsPeak;
  const highlightMask = smoothstep(0.5, 1.0, hsLumNorm);
  const shadowMask = 1.0 - smoothstep(0.0, 0.5, hsLumNorm);

  // Apply highlights (positive = darken highlights, scaled to HDR range)
  if (highlights !== 0.0) {
    const adj = highlights * highlightMask * hsPeak * (128.0 / 255.0);
    outR -= adj;
    outG -= adj;
    outB -= adj;
  }

  // Apply shadows (positive = brighten shadows, scaled to HDR range)
  if (shadows !== 0.0) {
    const adj = shadows * shadowMask * hsPeak * (128.0 / 255.0);
    outR += adj;
    outG += adj;
    outB += adj;
  }

  return [Math.max(outR, 0.0), Math.max(outG, 0.0), Math.max(outB, 0.0)];
}

// =============================================================================
// Vibrance
// =============================================================================

/**
 * Vibrance (intelligent saturation)
 * Port of GLSL section 5c (lines ~1129-1148)
 *
 * Boosts less-saturated colors more than already-saturated ones.
 * Optional skin tone protection reduces effect in skin hue range (20-50 degrees).
 */
export function applyVibrance(
  r: number,
  g: number,
  b: number,
  amount: number,
  skinProtection: boolean = false,
): [number, number, number] {
  if (amount === 0.0) return [r, g, b];

  const clamped: [number, number, number] = [
    Math.max(0.0, Math.min(1.0, r)),
    Math.max(0.0, Math.min(1.0, g)),
    Math.max(0.0, Math.min(1.0, b)),
  ];
  const [vibH, vibS, vibL] = rgbToHsl(clamped[0], clamped[1], clamped[2]);

  let skinProt = 1.0;
  if (skinProtection && vibH >= 20.0 && vibH <= 50.0 && vibS < 0.6 && vibL > 0.2 && vibL < 0.8) {
    const hueDistance = Math.abs(vibH - 35.0) / 15.0;
    skinProt = 0.3 + hueDistance * 0.7;
  }

  const satFactor = 1.0 - vibS * 0.5;
  const adjustment = amount * satFactor * skinProt;
  const newS = Math.max(0.0, Math.min(1.0, vibS + adjustment));

  if (Math.abs(newS - vibS) > 0.001) {
    return hslToRgb(vibH, newS, vibL);
  }

  return [r, g, b];
}

// =============================================================================
// Color Wheels (Lift / Gamma / Gain)
// =============================================================================

/**
 * Color Wheels (Lift/Gamma/Gain)
 * Port of GLSL section 6a (lines ~1197-1215)
 *
 * Uses smoothstep zone weighting:
 *   shadows  = smoothstep(0.5, 0.0, luma)
 *   highlights = smoothstep(0.5, 1.0, luma)
 *   midtones = 1 - shadows - highlights
 *
 * @param lift  - [r, g, b, master] additive offset for shadows
 * @param gamma - [r, g, b, master] gamma adjustment for midtones (1.0 = neutral)
 * @param gain  - [r, g, b, master] multiplicative gain for highlights (1.0 = neutral)
 */
export function applyColorWheels(
  r: number,
  g: number,
  b: number,
  lift: [number, number, number],
  gamma: [number, number, number],
  gain: [number, number, number],
): [number, number, number] {
  const cwLuma = LUMA_R * r + LUMA_G * g + LUMA_B * b;

  // Zone weights using smooth falloff
  const shadowW = smoothstep(0.5, 0.0, cwLuma);
  const highW = smoothstep(0.5, 1.0, cwLuma);
  const midW = 1.0 - shadowW - highW;

  // Lift (shadows)
  let outR = r + lift[0] * shadowW;
  let outG = g + lift[1] * shadowW;
  let outB = b + lift[2] * shadowW;

  // Gain (highlights)
  outR *= 1.0 + gain[0] * highW;
  outG *= 1.0 + gain[1] * highW;
  outB *= 1.0 + gain[2] * highW;

  // Gamma (midtones) - power function
  if (midW > 0.0) {
    const gammaExpR = 1.0 / Math.max(1.0 + gamma[0], 0.01);
    const gammaExpG = 1.0 / Math.max(1.0 + gamma[1], 0.01);
    const gammaExpB = 1.0 / Math.max(1.0 + gamma[2], 0.01);

    // mix(color, pow(max(color, 0), gammaExp), midW)
    const powR = Math.pow(Math.max(outR, 0.0), gammaExpR);
    const powG = Math.pow(Math.max(outG, 0.0), gammaExpG);
    const powB = Math.pow(Math.max(outB, 0.0), gammaExpB);

    outR = outR + (powR - outR) * midW;
    outG = outG + (powG - outG) * midW;
    outB = outB + (powB - outB) * midW;
  }

  return [outR, outG, outB];
}

/**
 * Compute color wheel zone weights for a given luminance.
 * Exported for testing zone weight properties.
 */
export function colorWheelZoneWeights(luma: number): {
  shadow: number;
  highlight: number;
  midtone: number;
} {
  const shadow = smoothstep(0.5, 0.0, luma);
  const highlight = smoothstep(0.5, 1.0, luma);
  const midtone = 1.0 - shadow - highlight;
  return { shadow, highlight, midtone };
}

// =============================================================================
// Spatial Filters
// =============================================================================

/**
 * Clarity filter: 5x5 Gaussian unsharp mask on midtones
 * Port of GLSL section 5e (lines ~1163-1192)
 *
 * @param pixels5x5 - Flat 25-element array of luminance values (row-major 5x5 neighborhood)
 * @param clarityAmount - Clarity strength (u_clarity)
 * @param processedLuminance - Luminance of the processed pixel (for midtone mask)
 * @returns Additive correction to apply to each channel
 */
export function clarityFilter(pixels5x5: number[], clarityAmount: number, processedLuminance: number): number {
  // 5x5 Gaussian blur (separable weights: 1,4,6,4,1)
  const weights = [1, 4, 6, 4, 1];
  let blurred = 0;
  let totalWeight = 0;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const w = weights[x]! * weights[y]!;
      blurred += pixels5x5[y * 5 + x]! * w;
      totalWeight += w;
    }
  }
  blurred /= totalWeight;

  // Midtone mask based on processed luminance, normalized for HDR
  const peakLum = Math.max(processedLuminance, 1.0);
  const normLum = processedLuminance / peakLum;
  const deviation = Math.abs(normLum - 0.5) * 2.0;
  const midtoneMask = 1.0 - deviation * deviation;

  // High-frequency detail (center is pixels5x5[12])
  const center = pixels5x5[12]!;
  const highFreq = center - blurred;
  const effectScale = clarityAmount * 0.7; // CLARITY_EFFECT_SCALE

  return highFreq * midtoneMask * effectScale;
}

/**
 * Sharpen filter: Laplacian unsharp mask
 * Port of GLSL section 7b (lines ~1352-1363)
 *
 * @param center - Center pixel value
 * @param neighbors4 - [up, down, left, right] neighbor values
 * @param amount - Sharpen amount (u_sharpenAmount)
 * @returns Sharpened value (clamped to >= 0)
 */
export function sharpenFilter(center: number, neighbors4: [number, number, number, number], amount: number): number {
  const sum = neighbors4[0] + neighbors4[1] + neighbors4[2] + neighbors4[3];
  const detail = center * 4.0 - sum;
  return Math.max(center + detail * amount, 0.0);
}

// =============================================================================
// Diagnostics
// =============================================================================

/**
 * Channel isolation
 * Port of GLSL section 10 (lines ~1408-1413)
 *
 * @param r - Red channel
 * @param g - Green channel
 * @param b - Blue channel
 * @param mode - 1=R, 2=G, 3=B, 4=A(1.0), 5=luma
 * @returns [r, g, b] with isolated channel replicated
 */
export function channelIsolation(r: number, g: number, b: number, mode: number): [number, number, number] {
  switch (mode) {
    case 1:
      return [r, r, r];
    case 2:
      return [g, g, g];
    case 3:
      return [b, b, b];
    case 4:
      return [1.0, 1.0, 1.0]; // alpha channel (assumed 1.0)
    case 5: {
      const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      return [luma, luma, luma];
    }
    default:
      return [r, g, b];
  }
}

/**
 * Bayer 8x8 dither matrix lookup
 * Port of GLSL `bayerDither8x8` (lines ~893-908)
 *
 * @param x - X position (will be wrapped to 0-7)
 * @param y - Y position (will be wrapped to 0-7)
 * @returns Dither value in [0, 1) range (normalized by 64)
 */
export function bayerDither8x8(x: number, y: number): number {
  const bayer = [
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30,
    54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
    61, 29, 53, 21,
  ];
  const ix = x & 7;
  const iy = y & 7;
  return (bayer[iy * 8 + ix]! + 0.5) / 64.0;
}

// =============================================================================
// Background Pattern
// =============================================================================

/**
 * Checker pattern
 * Port of GLSL background pattern == 2 (lines ~1512-1517)
 *
 * @param x - Pixel X position
 * @param y - Pixel Y position
 * @param size - Checker square size
 * @returns 0 for color1 (isLight), 1 for color2
 */
export function checkerPattern(x: number, y: number, size: number): number {
  const cx = Math.floor(x / size);
  const cy = Math.floor(y / size);
  const isLight = (cx + cy) % 2 === 0;
  return isLight ? 0 : 1;
}

// =============================================================================
// Hue Rotation Matrix
// =============================================================================

/**
 * Build a 3x3 luminance-preserving hue rotation matrix.
 * Port of `buildHueRotationMatrix` from effectProcessing.shared.ts.
 *
 * Returns a 9-element array in column-major order (for WebGL mat3).
 *
 * @param angleDegrees - Hue rotation in degrees
 * @returns 9-element column-major matrix
 */
export function buildHueRotationMatrix(angleDegrees: number): number[] {
  const rad = (angleDegrees * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const sq3 = Math.sqrt(3);
  const oo = 1 / 3;
  const t = 1 - cosA;

  // Rodrigues rotation around (1,1,1)/sqrt(3) (row-major)
  const r00 = cosA + t * oo;
  const r01 = t * oo - sinA / sq3;
  const r02 = t * oo + sinA / sq3;
  const r10 = t * oo + sinA / sq3;
  const r11 = cosA + t * oo;
  const r12 = t * oo - sinA / sq3;
  const r20 = t * oo - sinA / sq3;
  const r21 = t * oo + sinA / sq3;
  const r22 = cosA + t * oo;

  // Luminance shear correction: M = TInv * rot * T
  const dR = LUMA_R - oo;
  const dG = LUMA_G - oo;
  const dB = LUMA_B - oo;

  // P = rot * T
  const p00 = r00 + dR,
    p01 = r01 + dG,
    p02 = r02 + dB;
  const p10 = r10 + dR,
    p11 = r11 + dG,
    p12 = r12 + dB;
  const p20 = r20 + dR,
    p21 = r21 + dG,
    p22 = r22 + dB;

  // M = TInv * P
  const col0 = dR * p00 + dG * p10 + dB * p20;
  const col1 = dR * p01 + dG * p11 + dB * p21;
  const col2 = dR * p02 + dG * p12 + dB * p22;

  // Column-major order
  return [p00 - col0, p10 - col0, p20 - col0, p01 - col1, p11 - col1, p21 - col1, p02 - col2, p12 - col2, p22 - col2];
}

/**
 * Apply a column-major 3x3 matrix to an RGB triplet.
 */
export function applyMat3(mat: number[], r: number, g: number, b: number): [number, number, number] {
  return [
    mat[0]! * r + mat[3]! * g + mat[6]! * b,
    mat[1]! * r + mat[4]! * g + mat[7]! * b,
    mat[2]! * r + mat[5]! * g + mat[8]! * b,
  ];
}

// =============================================================================
// Display Transfer Dispatch
// =============================================================================

/**
 * Display transfer dispatch: applies the selected display transfer function.
 * Port of GLSL `applyDisplayTransfer(vec3 color, int tf)` (lines ~631-645)
 *
 * @param r - Red channel (linear)
 * @param g - Green channel (linear)
 * @param b - Blue channel (linear)
 * @param mode - 0=linear, 1=sRGB, 2=Rec.709, 3=gamma2.2, 4=gamma2.4, 5=custom
 * @param customGamma - Custom gamma value (used when mode=5)
 * @returns [r, g, b] display-encoded values
 */
export function applyDisplayTransferDispatch(
  r: number,
  g: number,
  b: number,
  mode: number,
  customGamma: number = 2.2,
): [number, number, number] {
  const cr = Math.max(r, 0);
  const cg = Math.max(g, 0);
  const cb = Math.max(b, 0);

  switch (mode) {
    case 0: // linear
      return [cr, cg, cb];
    case 1: // sRGB
      return [linearToSRGBChannel(cr), linearToSRGBChannel(cg), linearToSRGBChannel(cb)];
    case 2: // Rec.709
      return [linearToRec709Channel(cr), linearToRec709Channel(cg), linearToRec709Channel(cb)];
    case 3: // gamma 2.2
      return [Math.pow(cr, 1.0 / 2.2), Math.pow(cg, 1.0 / 2.2), Math.pow(cb, 1.0 / 2.2)];
    case 4: // gamma 2.4
      return [Math.pow(cr, 1.0 / 2.4), Math.pow(cg, 1.0 / 2.4), Math.pow(cb, 1.0 / 2.4)];
    case 5: // custom gamma
      return [Math.pow(cr, 1.0 / customGamma), Math.pow(cg, 1.0 / customGamma), Math.pow(cb, 1.0 / customGamma)];
    default:
      return [cr, cg, cb];
  }
}

// =============================================================================
// 3D LUT trilinear interpolation (matches GLSL applyLUT3DGeneric)
// =============================================================================

/**
 * Pure trilinear interpolation on a flat Float32Array representing a 3D LUT.
 * The LUT data is RGBA per texel, laid out as size^3 entries
 * (R varies fastest, then G, then B — matching OpenGL 3D texture layout).
 *
 * This mirrors the GLSL `applyLUT3DGeneric` which uses hardware trilinear
 * via `texture(sampler3D, coord)`. We perform the equivalent math on CPU:
 * normalize -> clamp -> scale to LUT coords -> trilinear interpolate 8 neighbors
 * -> blend with original by intensity.
 *
 * @param r Input red (linear, may exceed 0-1)
 * @param g Input green
 * @param b Input blue
 * @param lutData Flat Float32Array: RGBA per texel, size^3 texels
 * @param lutSize Cube dimension (e.g. 33)
 * @param domainMin [rMin, gMin, bMin]
 * @param domainMax [rMax, gMax, bMax]
 * @param intensity Blend factor (0 = original, 1 = full LUT)
 */
export function applyLUT3DTrilinear(
  r: number,
  g: number,
  b: number,
  lutData: Float32Array,
  lutSize: number,
  domainMin: [number, number, number],
  domainMax: [number, number, number],
  intensity: number,
): [number, number, number] {
  // Normalize input to [0,1] using domain
  const nr = Math.max(0, Math.min(1, (r - domainMin[0]) / (domainMax[0] - domainMin[0])));
  const ng = Math.max(0, Math.min(1, (g - domainMin[1]) / (domainMax[1] - domainMin[1])));
  const nb = Math.max(0, Math.min(1, (b - domainMin[2]) / (domainMax[2] - domainMin[2])));

  // Scale to LUT coordinates (continuous index, 0 to lutSize-1)
  const maxIdx = lutSize - 1;
  const ri = nr * maxIdx;
  const gi = ng * maxIdx;
  const bi = nb * maxIdx;

  // Integer and fractional parts
  const r0 = Math.floor(ri);
  const g0 = Math.floor(gi);
  const b0 = Math.floor(bi);
  const r1 = Math.min(r0 + 1, maxIdx);
  const g1 = Math.min(g0 + 1, maxIdx);
  const b1 = Math.min(b0 + 1, maxIdx);
  const rf = ri - r0;
  const gf = gi - g0;
  const bf = bi - b0;

  // Helper to read RGB from RGBA data (R varies fastest in 3D texture)
  const getColor = (ri: number, gi: number, bi: number): [number, number, number] => {
    const idx = (bi * lutSize * lutSize + gi * lutSize + ri) * 4;
    return [lutData[idx]!, lutData[idx + 1]!, lutData[idx + 2]!];
  };

  // 8 corners
  const c000 = getColor(r0, g0, b0);
  const c100 = getColor(r1, g0, b0);
  const c010 = getColor(r0, g1, b0);
  const c110 = getColor(r1, g1, b0);
  const c001 = getColor(r0, g0, b1);
  const c101 = getColor(r1, g0, b1);
  const c011 = getColor(r0, g1, b1);
  const c111 = getColor(r1, g1, b1);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    // Trilinear interpolation
    const c00 = lerp(c000[i]!, c100[i]!, rf);
    const c01 = lerp(c010[i]!, c110[i]!, rf);
    const c10 = lerp(c001[i]!, c101[i]!, rf);
    const c11 = lerp(c011[i]!, c111[i]!, rf);

    const c0 = lerp(c00, c01, gf);
    const c1 = lerp(c10, c11, gf);

    out[i] = lerp(c0, c1, bf);
  }

  // Blend with original by intensity
  return [r + (out[0] - r) * intensity, g + (out[1] - g) * intensity, b + (out[2] - b) * intensity];
}

// =============================================================================
// Premultiply / Unpremultiply alpha
// =============================================================================

/**
 * Premultiply alpha: multiply RGB by alpha.
 * Port of GLSL `color.rgb *= color.a` (line ~1504-1505)
 */
export function premultiplyAlpha(r: number, g: number, b: number, a: number): [number, number, number, number] {
  return [r * a, g * a, b * a, a];
}

/**
 * Unpremultiply alpha: divide RGB by alpha, guarding a=0.
 * Port of GLSL `color.rgb /= color.a` with `color.a > 1e-5` guard (line ~1036-1039)
 */
export function unpremultiplyAlpha(r: number, g: number, b: number, a: number): [number, number, number, number] {
  if (a > 1e-5) {
    return [r / a, g / a, b / a, a];
  }
  return [0, 0, 0, a];
}

// =============================================================================
// HSL Qualifier matte computation
// =============================================================================

/**
 * Compute the HSL qualifier matte value for a pixel.
 * Port of GLSL HSL Qualifier (line ~1256-1281)
 *
 * Input h/s/l are in HSL space:
 *   h: 0-360 (degrees)
 *   s: 0-1
 *   l: 0-1
 *
 * The qualifier operates in scaled units:
 *   saturation and luminance are scaled to 0-100 internally
 *   (matching the GLSL: qS = hslQ.y * 100.0, qL = hslQ.z * 100.0)
 *
 * @param h Pixel hue (0-360)
 * @param s Pixel saturation (0-1)
 * @param l Pixel luminance (0-1)
 * @param hueCenter Qualifier hue center (0-360)
 * @param hueWidth Qualifier hue width (degrees)
 * @param hueSoftness Qualifier hue softness (0-100, percentage of hueWidth)
 * @param satCenter Qualifier saturation center (0-100)
 * @param satWidth Qualifier saturation width (0-100)
 * @param satSoftness Qualifier saturation softness (0-100, percentage of satWidth)
 * @param lumCenter Qualifier luminance center (0-100)
 * @param lumWidth Qualifier luminance width (0-100)
 * @param lumSoftness Qualifier luminance softness (0-100, percentage of lumWidth)
 * @returns Matte value [0, 1]
 */
export function hslQualifierMatte(
  h: number,
  s: number,
  l: number,
  hueCenter: number,
  hueWidth: number,
  hueSoftness: number,
  satCenter: number,
  satWidth: number,
  satSoftness: number,
  lumCenter: number,
  lumWidth: number,
  lumSoftness: number,
): number {
  // Scale saturation and luminance to 0-100 (matching GLSL)
  const qS = s * 100.0;
  const qL = l * 100.0;

  // Hue match (circular distance)
  let hueDist = Math.abs(h - hueCenter);
  if (hueDist > 180.0) hueDist = 360.0 - hueDist;
  const hueInner = hueWidth / 2.0;
  const hueOuter = hueInner + (hueSoftness * hueWidth) / 100.0;
  const hueMatch = hueDist <= hueInner ? 1.0 : hueDist >= hueOuter ? 0.0 : smoothstep(hueOuter, hueInner, hueDist);

  // Saturation match
  const satDist = Math.abs(qS - satCenter);
  const satInner = satWidth / 2.0;
  const satOuter = satInner + (satSoftness * satWidth) / 100.0;
  const satMatch = satDist <= satInner ? 1.0 : satDist >= satOuter ? 0.0 : smoothstep(satOuter, satInner, satDist);

  // Luminance match
  const lumDist = Math.abs(qL - lumCenter);
  const lumInner = lumWidth / 2.0;
  const lumOuter = lumInner + (lumSoftness * lumWidth) / 100.0;
  const lumMatch = lumDist <= lumInner ? 1.0 : lumDist >= lumOuter ? 0.0 : smoothstep(lumOuter, lumInner, lumDist);

  return hueMatch * satMatch * lumMatch;
}

// =============================================================================
// 1D Curves LUT application
// =============================================================================

/**
 * Apply a 1D curves LUT to RGB.
 * Port of GLSL curves section (line ~1234-1246).
 *
 * The GLSL applies per-channel curves first (R from .r, G from .g, B from .b),
 * then a master curve (stored in .a channel) on top.
 *
 * lutData is RGBA texture data of width lutWidth (row of pixels).
 * For a given input value v in [0,1], we sample at texel index = v * (lutWidth-1),
 * linearly interpolated between the two nearest texels.
 *
 * @param r Input red [0,1]
 * @param g Input green [0,1]
 * @param b Input blue [0,1]
 * @param lutData Flat Float32Array: RGBA per texel, lutWidth texels
 * @param lutWidth Number of texels in the 1D LUT
 */
export function apply1DCurvesLUT(
  r: number,
  g: number,
  b: number,
  lutData: Float32Array,
  lutWidth: number,
): [number, number, number] {
  // Clamp to [0,1]
  let cr = Math.max(0, Math.min(1, r));
  let cg = Math.max(0, Math.min(1, g));
  let cb = Math.max(0, Math.min(1, b));
  // Preserve HDR excess
  const excessR = r - cr;
  const excessG = g - cg;
  const excessB = b - cb;

  // Helper: sample a specific channel from the 1D LUT with linear interpolation
  const sample = (val: number, channel: number): number => {
    const maxIdx = lutWidth - 1;
    const idx = val * maxIdx;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, maxIdx);
    const frac = idx - i0;
    const v0 = lutData[i0 * 4 + channel]!;
    const v1 = lutData[i1 * 4 + channel]!;
    return v0 + (v1 - v0) * frac;
  };

  // Per-channel curves: R from .r (channel 0), G from .g (channel 1), B from .b (channel 2)
  cr = sample(cr, 0);
  cg = sample(cg, 1);
  cb = sample(cb, 2);

  // Master curve (stored in alpha, channel 3)
  cr = sample(cr, 3);
  cg = sample(cg, 3);
  cb = sample(cb, 3);

  return [cr + excessR, cg + excessG, cb + excessB];
}
