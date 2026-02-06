/**
 * LUTPresets - Programmatic film emulation LUT presets
 *
 * Each preset generates a 17^3 3D LUT that can be applied via the LUT pipeline.
 */

import type { LUT3D } from './LUTLoader';

export interface LUTPreset {
  id: string;
  name: string;
  category: string;
  description: string;
}

export const LUT_PRESETS: LUTPreset[] = [
  { id: 'warm-film', name: 'Warm Film', category: 'Film', description: 'Warm golden tones reminiscent of Kodak film stocks' },
  { id: 'cool-chrome', name: 'Cool Chrome', category: 'Film', description: 'Cool silver tones with blue shadows' },
  { id: 'bleach-bypass', name: 'Bleach Bypass', category: 'Film', description: 'Desaturated with increased contrast' },
  { id: 'cross-process', name: 'Cross Process', category: 'Creative', description: 'Shifted colors from cross-processing' },
  { id: 'monochrome', name: 'Monochrome', category: 'B&W', description: 'Classic black and white conversion' },
  { id: 'cinematic-teal-orange', name: 'Teal & Orange', category: 'Creative', description: 'Hollywood teal shadows, orange highlights' },
  { id: 'vintage-fade', name: 'Vintage Fade', category: 'Creative', description: 'Lifted blacks with faded pastel tones' },
  { id: 'high-contrast', name: 'High Contrast', category: 'Technical', description: 'S-curve contrast enhancement' },
  { id: 'low-contrast', name: 'Low Contrast', category: 'Technical', description: 'Reduced contrast for flat look' },
  { id: 'identity', name: 'Identity (Bypass)', category: 'Technical', description: 'No color change - for testing' },
];

const LUT_SIZE = 17;

/**
 * Generate a 3D LUT from a preset
 */
export function generatePresetLUT(presetId: string): LUT3D | null {
  const preset = LUT_PRESETS.find(p => p.id === presetId);
  if (!preset) return null;

  const size = LUT_SIZE;
  const totalEntries = size * size * size;
  const data = new Float32Array(totalEntries * 3);

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const idx = (b * size * size + g * size + r) * 3;
        const rr = r / (size - 1);
        const gg = g / (size - 1);
        const bb = b / (size - 1);

        const [outR, outG, outB] = applyPresetTransform(presetId, rr, gg, bb);
        data[idx] = outR;
        data[idx + 1] = outG;
        data[idx + 2] = outB;
      }
    }
  }

  return {
    size,
    data,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    title: preset.name,
  };
}

/**
 * Apply preset color transform to a single RGB value
 */
function applyPresetTransform(presetId: string, r: number, g: number, b: number): [number, number, number] {
  switch (presetId) {
    case 'identity':
      return [r, g, b];

    case 'warm-film': {
      // Warm golden shift: boost reds/yellows, reduce blues
      const warmR = r * 1.05 + 0.02;
      const warmG = g * 1.0 + 0.01;
      const warmB = b * 0.88;
      // Soft S-curve
      return [softSCurve(clamp01(warmR)), softSCurve(clamp01(warmG)), softSCurve(clamp01(warmB))];
    }

    case 'cool-chrome': {
      // Cool blue shift with desaturation in shadows
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const shadowBlend = 1.0 - smoothstep(0.0, 0.4, luma);
      const coolR = r * 0.92;
      const coolG = g * 0.98;
      const coolB = b * 1.08 + shadowBlend * 0.05;
      return [softSCurve(clamp01(coolR)), softSCurve(clamp01(coolG)), softSCurve(clamp01(coolB))];
    }

    case 'bleach-bypass': {
      // Desaturate + increase contrast
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const desat = 0.5; // 50% desaturation
      const dR = r + (luma - r) * desat;
      const dG = g + (luma - g) * desat;
      const dB = b + (luma - b) * desat;
      // Strong S-curve
      return [strongSCurve(clamp01(dR)), strongSCurve(clamp01(dG)), strongSCurve(clamp01(dB))];
    }

    case 'cross-process': {
      // Shift channels: boost greens in shadows, magentas in highlights
      const cR = r * 0.9 + g * 0.1;
      const cG = g * 0.85 + b * 0.15 + 0.03;
      const cB = b * 0.7 + r * 0.3 - 0.02;
      return [softSCurve(clamp01(cR)), clamp01(cG), clamp01(cB)];
    }

    case 'monochrome': {
      // Rec.709 luminance
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const l = softSCurve(clamp01(luma));
      return [l, l, l];
    }

    case 'cinematic-teal-orange': {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // Shadows -> teal (low R, high G/B)
      const shadowW = 1.0 - smoothstep(0.0, 0.5, luma);
      // Highlights -> orange (high R/G, low B)
      const highW = smoothstep(0.5, 1.0, luma);
      const tR = r - shadowW * 0.08 + highW * 0.06;
      const tG = g + shadowW * 0.03 + highW * 0.02;
      const tB = b + shadowW * 0.08 - highW * 0.08;
      return [clamp01(tR), clamp01(tG), clamp01(tB)];
    }

    case 'vintage-fade': {
      // Lift blacks, fade highlights, pastel shift
      const fadeR = r * 0.85 + 0.08;
      const fadeG = g * 0.85 + 0.06;
      const fadeB = b * 0.80 + 0.10;
      // Compress highlights
      return [clamp01(fadeR * 0.95 + 0.03), clamp01(fadeG * 0.95 + 0.02), clamp01(fadeB * 0.95 + 0.04)];
    }

    case 'high-contrast': {
      return [strongSCurve(r), strongSCurve(g), strongSCurve(b)];
    }

    case 'low-contrast': {
      // Compress dynamic range
      const lowR = r * 0.7 + 0.15;
      const lowG = g * 0.7 + 0.15;
      const lowB = b * 0.7 + 0.15;
      return [clamp01(lowR), clamp01(lowG), clamp01(lowB)];
    }

    default:
      return [r, g, b];
  }
}

// --- Utility functions ---

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function softSCurve(x: number): number {
  // Mild S-curve using smoothstep
  return smoothstep(0, 1, x);
}

function strongSCurve(x: number): number {
  // Stronger S-curve: apply smoothstep twice
  return smoothstep(0, 1, smoothstep(0, 1, x));
}

/**
 * Get all available presets
 */
export function getPresets(): LUTPreset[] {
  return [...LUT_PRESETS];
}

/**
 * Get presets by category
 */
export function getPresetsByCategory(): Map<string, LUTPreset[]> {
  const categories = new Map<string, LUTPreset[]>();
  for (const preset of LUT_PRESETS) {
    const list = categories.get(preset.category) ?? [];
    list.push(preset);
    categories.set(preset.category, list);
  }
  return categories;
}
