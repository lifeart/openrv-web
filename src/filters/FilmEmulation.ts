/**
 * FilmEmulation - Classic film stock emulation with grain overlay
 *
 * Each preset defines per-channel tone curves, saturation/hue shifts, and
 * grain characteristics that mimic the photochemical response of real film.
 * Grain is luminance-dependent (stronger in midtones) and seeded for
 * per-frame animation.
 */

import { clamp } from '../utils/math';
import { luminanceRec709 } from '../color/PixelMath';

// --- Types ---

export type FilmStockId =
  | 'kodak-portra-400'
  | 'kodak-ektar-100'
  | 'fuji-pro-400h'
  | 'fuji-velvia-50'
  | 'kodak-tri-x-400'
  | 'ilford-hp5';

export interface FilmEmulationParams {
  enabled: boolean;
  stock: FilmStockId;
  intensity: number;       // 0-100 — blend between original and full effect
  grainIntensity: number;  // 0-100 — grain overlay strength
  grainSeed: number;       // Changes per frame for animated grain
}

export interface FilmStockProfile {
  id: FilmStockId;
  name: string;
  description: string;
  /** Per-channel tone curve applied in 0-1 space */
  toneCurve: (r: number, g: number, b: number) => [number, number, number];
  /** Saturation multiplier (1.0 = unchanged) */
  saturation: number;
  /** Base grain amount (scaled by grainIntensity param) */
  grainAmount: number;
}

export const DEFAULT_FILM_EMULATION_PARAMS: FilmEmulationParams = {
  enabled: false,
  stock: 'kodak-portra-400',
  intensity: 100,
  grainIntensity: 30,
  grainSeed: 0,
};

// --- Film stock profiles ---

function softSCurve(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function strongSCurve(x: number): number {
  return softSCurve(softSCurve(x));
}

function liftGamma(x: number, lift: number, gamma: number): number {
  return clamp(lift + (1 - lift) * Math.pow(clamp(x, 0, 1), gamma), 0, 1);
}

export const FILM_STOCKS: FilmStockProfile[] = [
  {
    id: 'kodak-portra-400',
    name: 'Kodak Portra 400',
    description: 'Warm skin tones, pastel colors, low contrast with lifted shadows',
    toneCurve(r, g, b) {
      // Lifted blacks, warm shift, gentle S-curve
      const cr = liftGamma(r * 1.03 + 0.01, 0.03, 0.95);
      const cg = liftGamma(g * 1.00, 0.02, 0.97);
      const cb = liftGamma(b * 0.95, 0.01, 1.02);
      return [softSCurve(cr), softSCurve(cg), softSCurve(cb)];
    },
    saturation: 0.85,
    grainAmount: 0.35,
  },
  {
    id: 'kodak-ektar-100',
    name: 'Kodak Ektar 100',
    description: 'Vivid colors, strong contrast, saturated reds and blues',
    toneCurve(r, g, b) {
      // Strong S-curve, boosted saturation via channel push
      const cr = strongSCurve(r * 1.05);
      const cg = strongSCurve(g * 1.02);
      const cb = strongSCurve(b * 1.06);
      return [clamp(cr, 0, 1), clamp(cg, 0, 1), clamp(cb, 0, 1)];
    },
    saturation: 1.3,
    grainAmount: 0.15,
  },
  {
    id: 'fuji-pro-400h',
    name: 'Fuji Pro 400H',
    description: 'Slightly cool, pastel rendering with gentle contrast',
    toneCurve(r, g, b) {
      // Cool shift, lifted shadows, gentle curve
      const cr = liftGamma(r * 0.97, 0.02, 0.98);
      const cg = liftGamma(g * 1.01 + 0.01, 0.02, 0.96);
      const cb = liftGamma(b * 1.04 + 0.02, 0.03, 0.95);
      return [softSCurve(cr), softSCurve(cg), softSCurve(cb)];
    },
    saturation: 0.88,
    grainAmount: 0.3,
  },
  {
    id: 'fuji-velvia-50',
    name: 'Fuji Velvia 50',
    description: 'Ultra-vivid slide film with deep blacks and high contrast',
    toneCurve(r, g, b) {
      // Deep blacks (no lift), strong S-curve, channel boost
      const cr = strongSCurve(r * 1.08);
      const cg = strongSCurve(g * 1.06);
      const cb = strongSCurve(b * 1.1);
      return [clamp(cr, 0, 1), clamp(cg, 0, 1), clamp(cb, 0, 1)];
    },
    saturation: 1.5,
    grainAmount: 0.1,
  },
  {
    id: 'kodak-tri-x-400',
    name: 'Kodak Tri-X 400',
    description: 'Classic B&W with rich midtones and characteristic grain',
    toneCurve(r, g, b) {
      // Convert to luminance, apply characteristic curve
      const luma = luminanceRec709(r, g, b);
      const curved = liftGamma(luma, 0.02, 0.9);
      const v = softSCurve(curved);
      return [v, v, v];
    },
    saturation: 0, // fully desaturated (B&W)
    grainAmount: 0.55,
  },
  {
    id: 'ilford-hp5',
    name: 'Ilford HP5 Plus',
    description: 'Fine-grain B&W with smooth tonal range',
    toneCurve(r, g, b) {
      const luma = luminanceRec709(r, g, b);
      // Slightly lifted shadows, gentler curve than Tri-X
      const curved = liftGamma(luma, 0.03, 0.95);
      const v = softSCurve(curved);
      return [v, v, v];
    },
    saturation: 0,
    grainAmount: 0.3,
  },
];

/**
 * Get a film stock profile by ID.
 */
export function getFilmStock(id: FilmStockId): FilmStockProfile | undefined {
  return FILM_STOCKS.find(s => s.id === id);
}

/**
 * Get all available film stock profiles.
 */
export function getFilmStocks(): FilmStockProfile[] {
  return [...FILM_STOCKS];
}

/**
 * Check if film emulation would modify pixels.
 */
export function isFilmEmulationActive(params: FilmEmulationParams): boolean {
  return params.enabled && params.intensity > 0;
}

/**
 * Apply film emulation to ImageData in-place.
 */
export function applyFilmEmulation(
  imageData: ImageData,
  params: FilmEmulationParams
): void {
  if (!params.enabled || params.intensity <= 0) return;

  const stock = getFilmStock(params.stock);
  if (!stock) return;

  const { data, width, height } = imageData;
  const intensity = clamp(params.intensity, 0, 100) / 100;
  const grainStrength = (clamp(params.grainIntensity, 0, 100) / 100) * stock.grainAmount;

  // Simple deterministic PRNG for grain (xorshift32)
  let rngState = (params.grainSeed | 0) || 1;
  function nextRng(): number {
    rngState ^= rngState << 13;
    rngState ^= rngState >> 17;
    rngState ^= rngState << 5;
    // Return value in -1..1 range
    return ((rngState & 0xffff) / 0x8000) - 1;
  }

  const totalPixels = width * height;

  for (let p = 0; p < totalPixels; p++) {
    const i = p * 4;
    const origR = data[i]!;
    const origG = data[i + 1]!;
    const origB = data[i + 2]!;
    // Alpha untouched

    // Normalize to 0-1
    let r = origR / 255;
    let g = origG / 255;
    let b = origB / 255;

    // Apply tone curve
    const [cr, cg, cb] = stock.toneCurve(r, g, b);

    // Apply saturation adjustment
    const luma = luminanceRec709(cr, cg, cb);
    const sat = stock.saturation;
    r = luma + (cr - luma) * sat;
    g = luma + (cg - luma) * sat;
    b = luma + (cb - luma) * sat;

    // Apply grain (luminance-dependent: strongest in midtones)
    if (grainStrength > 0) {
      // Grain envelope: bell curve peaking at mid-luminance
      const grainEnvelope = 4 * luma * (1 - luma); // 0 at black/white, 1 at 50% gray
      const grainAmount = grainStrength * grainEnvelope;
      const noise = nextRng() * grainAmount;
      r += noise;
      g += noise;
      b += noise;
    }

    // Blend with original based on intensity
    r = origR / 255 * (1 - intensity) + clamp(r, 0, 1) * intensity;
    g = origG / 255 * (1 - intensity) + clamp(g, 0, 1) * intensity;
    b = origB / 255 * (1 - intensity) + clamp(b, 0, 1) * intensity;

    data[i] = Math.round(clamp(r, 0, 1) * 255);
    data[i + 1] = Math.round(clamp(g, 0, 1) * 255);
    data[i + 2] = Math.round(clamp(b, 0, 1) * 255);
  }
}
