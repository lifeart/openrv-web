/**
 * CIE1931Data - CIE 1931 2-degree observer chromaticity data and color space primaries.
 *
 * Provides the spectral locus boundary, chromaticity conversion helpers,
 * and primary/white-point data for common color spaces (derived from
 * the RGB-to-XYZ matrices in OCIOTransform.ts).
 */

import type { Matrix3x3 } from './OCIOTransform';
import {
  SRGB_TO_XYZ,
  ACESCG_TO_XYZ,
  ACES2065_TO_XYZ,
  DCIP3_TO_XYZ,
  REC2020_TO_XYZ,
  ADOBERGB_TO_XYZ,
  PROPHOTO_TO_XYZ_D50,
} from './OCIOTransform';

// =============================================================================
// CIE 1931 Spectral Locus (2-degree observer, 5 nm steps)
// =============================================================================

/**
 * CIE 1931 xy chromaticity coordinates for the spectral locus.
 * 380 nm to 700 nm in 5 nm steps (65 points).
 * The line of purples connects the first and last points.
 */
export const CIE_1931_XY_LOCUS: Array<{ x: number; y: number }> = [
  { x: 0.1741, y: 0.0050 }, // 380nm
  { x: 0.1740, y: 0.0050 }, // 385nm
  { x: 0.1738, y: 0.0049 }, // 390nm
  { x: 0.1736, y: 0.0049 }, // 395nm
  { x: 0.1733, y: 0.0048 }, // 400nm
  { x: 0.1726, y: 0.0048 }, // 405nm
  { x: 0.1714, y: 0.0051 }, // 410nm
  { x: 0.1689, y: 0.0069 }, // 415nm
  { x: 0.1644, y: 0.0109 }, // 420nm
  { x: 0.1566, y: 0.0177 }, // 425nm
  { x: 0.1440, y: 0.0297 }, // 430nm
  { x: 0.1241, y: 0.0578 }, // 435nm
  { x: 0.0913, y: 0.1327 }, // 440nm
  { x: 0.0687, y: 0.2007 }, // 445nm
  { x: 0.0454, y: 0.2950 }, // 450nm
  { x: 0.0235, y: 0.4127 }, // 455nm
  { x: 0.0082, y: 0.5384 }, // 460nm
  { x: 0.0039, y: 0.6548 }, // 465nm
  { x: 0.0139, y: 0.7502 }, // 470nm
  { x: 0.0389, y: 0.8120 }, // 475nm
  { x: 0.0743, y: 0.8338 }, // 480nm
  { x: 0.1142, y: 0.8262 }, // 485nm
  { x: 0.1547, y: 0.8059 }, // 490nm
  { x: 0.1929, y: 0.7816 }, // 495nm
  { x: 0.2296, y: 0.7543 }, // 500nm
  { x: 0.2658, y: 0.7243 }, // 505nm
  { x: 0.3016, y: 0.6923 }, // 510nm
  { x: 0.3373, y: 0.6589 }, // 515nm
  { x: 0.3731, y: 0.6245 }, // 520nm
  { x: 0.4087, y: 0.5896 }, // 525nm
  { x: 0.4441, y: 0.5547 }, // 530nm
  { x: 0.4788, y: 0.5202 }, // 535nm
  { x: 0.5125, y: 0.4866 }, // 540nm
  { x: 0.5448, y: 0.4544 }, // 545nm
  { x: 0.5752, y: 0.4242 }, // 550nm
  { x: 0.6029, y: 0.3965 }, // 555nm
  { x: 0.6270, y: 0.3725 }, // 560nm
  { x: 0.6482, y: 0.3514 }, // 565nm
  { x: 0.6658, y: 0.3340 }, // 570nm
  { x: 0.6801, y: 0.3197 }, // 575nm
  { x: 0.6915, y: 0.3083 }, // 580nm
  { x: 0.7006, y: 0.2993 }, // 585nm
  { x: 0.7079, y: 0.2920 }, // 590nm
  { x: 0.7140, y: 0.2859 }, // 595nm
  { x: 0.7190, y: 0.2809 }, // 600nm
  { x: 0.7230, y: 0.2770 }, // 605nm
  { x: 0.7260, y: 0.2740 }, // 610nm
  { x: 0.7283, y: 0.2717 }, // 615nm
  { x: 0.7300, y: 0.2700 }, // 620nm
  { x: 0.7311, y: 0.2689 }, // 625nm
  { x: 0.7320, y: 0.2680 }, // 630nm
  { x: 0.7327, y: 0.2673 }, // 635nm
  { x: 0.7334, y: 0.2666 }, // 640nm
  { x: 0.7340, y: 0.2660 }, // 645nm
  { x: 0.7344, y: 0.2656 }, // 650nm
  { x: 0.7346, y: 0.2654 }, // 655nm
  { x: 0.7347, y: 0.2653 }, // 660nm
  { x: 0.7347, y: 0.2653 }, // 665nm
  { x: 0.7347, y: 0.2653 }, // 670nm
  { x: 0.7347, y: 0.2653 }, // 675nm
  { x: 0.7347, y: 0.2653 }, // 680nm
  { x: 0.7347, y: 0.2653 }, // 685nm
  { x: 0.7347, y: 0.2653 }, // 690nm
  { x: 0.7347, y: 0.2653 }, // 695nm
  { x: 0.7347, y: 0.2653 }, // 700nm
];

// =============================================================================
// Chromaticity Conversion
// =============================================================================

/**
 * Convert CIE XYZ tristimulus values to xy chromaticity coordinates.
 * Guards against division by zero.
 */
export function xyzToXY(X: number, Y: number, Z: number): { x: number; y: number } {
  const sum = X + Y + Z;
  if (sum < 1e-10) {
    return { x: 0, y: 0 };
  }
  return { x: X / sum, y: Y / sum };
}

// =============================================================================
// Color Space Primaries
// =============================================================================

/**
 * Primary and white-point chromaticity coordinates for a color space
 */
export interface ColorSpacePrimaries {
  name: string;
  red: { x: number; y: number };
  green: { x: number; y: number };
  blue: { x: number; y: number };
  white: { x: number; y: number };
}

/**
 * Derive primary xy coordinates from a row-major RGB-to-XYZ matrix.
 *
 * Row-major layout:
 *   M[0] M[1] M[2]     Xr Xg Xb
 *   M[3] M[4] M[5]  =  Yr Yg Yb
 *   M[6] M[7] M[8]     Zr Zg Zb
 *
 * Red column: (M[0], M[3], M[6])
 * Green column: (M[1], M[4], M[7])
 * Blue column: (M[2], M[5], M[8])
 * White = sum of columns = M * [1,1,1]
 */
function derivePrimaries(name: string, m: Matrix3x3): ColorSpacePrimaries {
  return {
    name,
    red: xyzToXY(m[0], m[3], m[6]),
    green: xyzToXY(m[1], m[4], m[7]),
    blue: xyzToXY(m[2], m[5], m[8]),
    white: xyzToXY(m[0] + m[1] + m[2], m[3] + m[4] + m[5], m[6] + m[7] + m[8]),
  };
}

// =============================================================================
// Single source of truth: color space name → RGB-to-XYZ matrix.
// COLOR_SPACE_PRIMARIES is derived from this registry, eliminating duplication.
// =============================================================================

const COLOR_SPACE_MATRICES: Record<string, Matrix3x3> = {
  'sRGB': SRGB_TO_XYZ,
  'Rec.709': SRGB_TO_XYZ,
  'ACEScg': ACESCG_TO_XYZ,
  'ACES2065-1': ACES2065_TO_XYZ,
  'DCI-P3': DCIP3_TO_XYZ,
  'Rec.2020': REC2020_TO_XYZ,
  'Adobe RGB': ADOBERGB_TO_XYZ,
  'ProPhoto RGB': PROPHOTO_TO_XYZ_D50,
};

/**
 * All known color space primaries, derived from matrices in OCIOTransform.ts
 */
export const COLOR_SPACE_PRIMARIES: Record<string, ColorSpacePrimaries> = Object.fromEntries(
  Object.entries(COLOR_SPACE_MATRICES).map(([name, matrix]) => [name, derivePrimaries(name, matrix)])
);

/**
 * Get primaries for a color space by name
 */
export function getColorSpacePrimaries(name: string): ColorSpacePrimaries | null {
  return COLOR_SPACE_PRIMARIES[name] ?? null;
}

/**
 * Get the RGB-to-XYZ matrix for a named color space.
 * Returns null for unknown spaces.
 */
export function getRGBToXYZMatrix(colorSpaceName: string): Matrix3x3 | null {
  return COLOR_SPACE_MATRICES[colorSpaceName] ?? null;
}
