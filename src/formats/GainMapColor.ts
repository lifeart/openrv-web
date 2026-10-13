/**
 * GainMapColor - colour handling for gain map base images
 *
 * The base rendition of a gain map image (JPEG/Ultra HDR, AVIF, HEIC) is not
 * always sRGB: iPhone bases are Display P3, ISO 21496-1 files may carry a PQ
 * or HLG HDR base. This module works out what the container declares (CICP /
 * nclx or an ICC profile), decodes the base so its code values keep that
 * colour space, and linearises them to float with 1.0 = SDR white
 * (203 cd/m², ITU-R BT.2408 — the app's linear convention).
 *
 * Two decode routes:
 * - managed: the browser colour-manages the base into a 2D canvas whose colour
 *   space matches the declared primaries ('srgb' or 'display-p3'), so P3
 *   bases are not clipped to sRGB. Values come back sRGB-encoded in that space.
 *   Used for SDR bases, including ones described only by an ICC profile.
 * - raw: the bitmap is decoded with colorSpaceConversion 'none' and the code
 *   values are linearised with the declared transfer (PQ, HLG, linear, or an
 *   SDR curve on BT.2020 primaries), which a 2D canvas cannot represent.
 *
 * The gain map itself is always read raw: its samples are data, not colour.
 */

import type { ColorPrimaries } from '../core/image/Image';
import { pqDecode } from '../color/TransferFunctions';
import { srgbToLinear } from './GainMapMetadata';
import { drawImageWithOrientation } from './shared';

// =============================================================================
// Types
// =============================================================================

/** Transfer of the base image code values. 'srgb' covers every SDR curve. */
export type GainMapBaseTransfer = 'srgb' | 'linear' | 'pq' | 'hlg';

/** Colour description of a base image, as declared by its container. */
export interface GainMapBaseColor {
  /**
   * Declared primaries. 'other' means a profile declares primaries we cannot
   * label (e.g. Adobe RGB); null means nothing was declared (assume sRGB).
   */
  primaries: ColorPrimaries | 'other' | null;
  /** Declared transfer; null when not declared or left to colour management. */
  transfer: GainMapBaseTransfer | null;
}

/** How to decode a base image. */
export type GainMapBaseDecodePlan =
  | { kind: 'managed'; canvasColorSpace: PredefinedColorSpace }
  | { kind: 'raw'; transfer: GainMapBaseTransfer; primaries: ColorPrimaries };

/** A base image linearised to float RGBA. */
export interface LinearGainMapBase {
  width: number;
  height: number;
  /** Linear RGBA, 1.0 = SDR white, alpha 1 */
  data: Float32Array;
  colorPrimaries: ColorPrimaries;
}

// =============================================================================
// CICP / nclx
// =============================================================================

/**
 * Map ITU-T H.273 colour_primaries / transfer_characteristics codes.
 * Unknown or unspecified codes map to null.
 */
export function colorFromCicp(primariesCode: number, transferCode: number): GainMapBaseColor {
  let primaries: GainMapBaseColor['primaries'] = null;
  if (primariesCode === 1) primaries = 'bt709';
  else if (primariesCode === 9) primaries = 'bt2020';
  else if (primariesCode === 12) primaries = 'p3';
  else if (primariesCode !== 2 && primariesCode !== 0) primaries = 'other';

  let transfer: GainMapBaseTransfer | null = null;
  // BT.709, BT.601, sRGB, BT.2020 10/12-bit: SDR curves, decoded with the sRGB EOTF.
  if (transferCode === 1 || transferCode === 6 || transferCode === 13 || transferCode === 14 || transferCode === 15) {
    transfer = 'srgb';
  } else if (transferCode === 8) transfer = 'linear';
  else if (transferCode === 16) transfer = 'pq';
  else if (transferCode === 18) transfer = 'hlg';

  return { primaries, transfer };
}

// =============================================================================
// ICC profiles
// =============================================================================

type XY = [number, number];
type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

const PRIMARIES_XY: Record<ColorPrimaries, [XY, XY, XY]> = {
  bt709: [
    [0.64, 0.33],
    [0.3, 0.6],
    [0.15, 0.06],
  ],
  p3: [
    [0.68, 0.32],
    [0.265, 0.69],
    [0.15, 0.06],
  ],
  bt2020: [
    [0.708, 0.292],
    [0.17, 0.797],
    [0.131, 0.046],
  ],
};

const D65_XY: XY = [0.3127, 0.329];

/** Bradford chromatic adaptation D65 -> D50 (ICC PCS white). */
const BRADFORD_D65_TO_D50: Mat3 = [
  [1.0478112, 0.0228866, -0.050127],
  [0.0295424, 0.9904844, -0.0170491],
  [-0.0092345, 0.0150436, 0.7521316],
];

/** Determinant of the matrix whose columns are a, b, c. */
function det3(a: Vec3, b: Vec3, c: Vec3): number {
  return a[0] * (b[1] * c[2] - c[1] * b[2]) - b[0] * (a[1] * c[2] - c[1] * a[2]) + c[0] * (a[1] * b[2] - b[1] * a[2]);
}

function mulMat3Vec3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/**
 * ICC rXYZ/gXYZ/bXYZ colorants (D50-adapted) for a D65 RGB space.
 * Returns [r, g, b], each [X, Y, Z].
 */
export function iccColorantsFor(primaries: ColorPrimaries): [Vec3, Vec3, Vec3] {
  const xyz = (p: XY): Vec3 => [p[0] / p[1], 1, (1 - p[0] - p[1]) / p[1]];
  const [pr, pg, pb] = PRIMARIES_XY[primaries];
  const r = xyz(pr);
  const g = xyz(pg);
  const b = xyz(pb);
  const w = xyz(D65_XY);
  // Scale the primaries so they sum to white: solve [r g b] * s = w (Cramer's rule).
  const d = det3(r, g, b);
  const sr = det3(w, g, b) / d;
  const sg = det3(r, w, b) / d;
  const sb = det3(r, g, w) / d;
  const scaled = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
  return [
    mulMat3Vec3(BRADFORD_D65_TO_D50, scaled(r, sr)),
    mulMat3Vec3(BRADFORD_D65_TO_D50, scaled(g, sg)),
    mulMat3Vec3(BRADFORD_D65_TO_D50, scaled(b, sb)),
  ];
}

const ICC_COLORANT_TOLERANCE = 0.006;
const KNOWN_ICC_PRIMARIES: ColorPrimaries[] = ['bt709', 'p3', 'bt2020'];
let iccColorantCache: Array<{ primaries: ColorPrimaries; colorants: Vec3[] }> | null = null;

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * Classify an ICC profile: CICP tag (ICC v4.4) when present, otherwise the
 * colorant tags matched against sRGB/BT.709, Display P3 and BT.2020.
 * Returns null for non-RGB or malformed profiles. The transfer stays null for
 * colorant-only profiles: those bases go through the managed route, where the
 * browser applies the profile's tone curves.
 */
export function parseICCProfileColor(icc: Uint8Array): GainMapBaseColor | null {
  if (icc.byteLength < 132) return null;
  const view = new DataView(icc.buffer, icc.byteOffset, icc.byteLength);
  if (readFourCC(view, 36) !== 'acsp') return null;
  if (readFourCC(view, 16) !== 'RGB ') return null;

  const tagCount = view.getUint32(128);
  const tags = new Map<string, number>();
  for (let i = 0; i < tagCount && i < 256; i++) {
    const pos = 132 + i * 12;
    if (pos + 12 > icc.byteLength) break;
    const offset = view.getUint32(pos + 4);
    const size = view.getUint32(pos + 8);
    if (offset + size <= icc.byteLength) tags.set(readFourCC(view, pos), offset);
  }

  const cicp = tags.get('cicp');
  if (cicp !== undefined && cicp + 12 <= icc.byteLength && readFourCC(view, cicp) === 'cicp') {
    const fromCicp = colorFromCicp(view.getUint8(cicp + 8), view.getUint8(cicp + 9));
    if (fromCicp.primaries !== null || fromCicp.transfer !== null) return fromCicp;
  }

  const readXYZ = (sig: string): Vec3 | null => {
    const off = tags.get(sig);
    if (off === undefined || off + 20 > icc.byteLength || readFourCC(view, off) !== 'XYZ ') return null;
    return [view.getInt32(off + 8) / 65536, view.getInt32(off + 12) / 65536, view.getInt32(off + 16) / 65536];
  };
  const r = readXYZ('rXYZ');
  const g = readXYZ('gXYZ');
  const b = readXYZ('bXYZ');
  if (!r || !g || !b) return { primaries: 'other', transfer: null };

  if (!iccColorantCache) {
    iccColorantCache = KNOWN_ICC_PRIMARIES.map((p) => ({ primaries: p, colorants: iccColorantsFor(p) }));
  }
  const measured: Vec3[] = [r, g, b];
  const near = (a: Vec3, ref: Vec3 | undefined): boolean =>
    ref !== undefined && a.every((v, i) => Math.abs(v - ref[i as 0 | 1 | 2]) <= ICC_COLORANT_TOLERANCE);
  for (const { primaries, colorants } of iccColorantCache) {
    if (measured.every((col, k) => near(col, colorants[k]))) return { primaries, transfer: null };
  }
  return { primaries: 'other', transfer: null };
}

/**
 * Parse the payload of an ISOBMFF 'colr' box (after the 8-byte box header).
 * Handles 'nclx' (CICP) and 'prof'/'rICC' (ICC profile).
 */
export function parseColrPayload(view: DataView, start: number, end: number): GainMapBaseColor | null {
  if (start + 4 > end) return null;
  const type = readFourCC(view, start);
  if (type === 'nclx') {
    if (start + 8 > end) return null;
    return colorFromCicp(view.getUint16(start + 4), view.getUint16(start + 6));
  }
  if (type === 'prof' || type === 'rICC') {
    return parseICCProfileColor(new Uint8Array(view.buffer, view.byteOffset + start + 4, end - start - 4));
  }
  return null;
}

/**
 * Merge several declarations of the same image (e.g. HEIF 'nclx' + 'prof').
 * CICP transfer wins (an ICC profile cannot express PQ/HLG without a cicp
 * tag), known primaries win over unknown ones.
 */
export function mergeBaseColor(colors: Array<GainMapBaseColor | null>): GainMapBaseColor | null {
  let primaries: GainMapBaseColor['primaries'] = null;
  let transfer: GainMapBaseTransfer | null = null;
  for (const c of colors) {
    if (!c) continue;
    if (c.transfer !== null && transfer === null) transfer = c.transfer;
    if (c.primaries !== null && (primaries === null || primaries === 'other')) primaries = c.primaries;
  }
  return primaries === null && transfer === null ? null : { primaries, transfer };
}

// =============================================================================
// Decode planning and linearisation
// =============================================================================

/**
 * Pick how to decode a base image from its declared colour.
 *
 * - PQ / HLG / linear transfer: raw (unknown primaries default to BT.2020 for
 *   PQ/HLG, BT.709 for linear).
 * - BT.2020 primaries with a declared SDR transfer: raw (a 2D canvas cannot
 *   hold BT.2020 without clipping).
 * - Display P3, BT.2020 via ICC only, or unrecognised ICC primaries: managed
 *   into a 'display-p3' canvas (widest a 2D canvas offers).
 * - sRGB / undeclared: managed into an 'srgb' canvas.
 */
export function planBaseDecode(color: GainMapBaseColor | null): GainMapBaseDecodePlan {
  const declared = color?.primaries;
  const known: ColorPrimaries | null =
    declared === 'bt709' || declared === 'p3' || declared === 'bt2020' ? declared : null;
  const transfer = color?.transfer ?? null;

  if (transfer === 'pq' || transfer === 'hlg') {
    return { kind: 'raw', transfer, primaries: known ?? 'bt2020' };
  }
  if (transfer === 'linear') {
    return { kind: 'raw', transfer, primaries: known ?? 'bt709' };
  }
  if (known === 'bt2020' && transfer === 'srgb') {
    return { kind: 'raw', transfer, primaries: 'bt2020' };
  }
  if (declared === 'p3' || declared === 'bt2020' || declared === 'other') {
    return { kind: 'managed', canvasColorSpace: 'display-p3' };
  }
  return { kind: 'managed', canvasColorSpace: 'srgb' };
}

/** BT.2100 HLG OOTF constants (match the viewer shader's hlgToLinear). */
const HLG_NOMINAL_PEAK_NITS = 1000;
const HDR_REFERENCE_WHITE_NITS = 203;
const HLG_OOTF_THRESH = 0.01;
const HLG_OOTF_SLOPE = 39.810717; // HLG_OOTF_THRESH^(-0.8)
const PQ_PEAK_NITS = 10000;

const LUMA: Record<ColorPrimaries, [number, number, number]> = {
  bt709: [0.2126, 0.7152, 0.0722],
  p3: [0.2289746, 0.6917385, 0.0792869],
  bt2020: [0.2627, 0.678, 0.0593],
};

function hlgInverseOETF(e: number): number {
  const a = 0.17883277;
  const b = 0.28466892;
  const c = 0.55991073;
  return e <= 0.5 ? (e * e) / 3 : (Math.exp((e - c) / a) + b) / 12;
}

/**
 * Linearise 8-bit RGBA base code values to float RGBA with 1.0 = SDR white.
 *
 * - srgb: IEC 61966-2-1 EOTF (SDR white = code 255 = 1.0)
 * - linear: code / 255
 * - pq: ST 2084 EOTF, x 10000 / 203
 * - hlg: BT.2100 inverse OETF + OOTF (gamma 1.2 at 1000 cd/m², luma of the
 *   given primaries), x 1000 / 203 — identical to the viewer's HLG input path
 */
export function linearizeBasePixels(
  raw: Uint8ClampedArray,
  pixelCount: number,
  transfer: GainMapBaseTransfer,
  primaries: ColorPrimaries = 'bt709',
): Float32Array {
  const out = new Float32Array(pixelCount * 4);
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    if (transfer === 'srgb') lut[i] = srgbToLinear(v);
    else if (transfer === 'linear') lut[i] = v;
    else if (transfer === 'pq') lut[i] = (pqDecode(v) * PQ_PEAK_NITS) / HDR_REFERENCE_WHITE_NITS;
    else lut[i] = hlgInverseOETF(v);
  }

  if (transfer !== 'hlg') {
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      out[idx] = lut[raw[idx] ?? 0] ?? 0;
      out[idx + 1] = lut[raw[idx + 1] ?? 0] ?? 0;
      out[idx + 2] = lut[raw[idx + 2] ?? 0] ?? 0;
      out[idx + 3] = 1.0;
    }
    return out;
  }

  const [kr, kg, kb] = LUMA[primaries];
  const peakScale = HLG_NOMINAL_PEAK_NITS / HDR_REFERENCE_WHITE_NITS;
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const r = lut[raw[idx] ?? 0] ?? 0;
    const g = lut[raw[idx + 1] ?? 0] ?? 0;
    const b = lut[raw[idx + 2] ?? 0] ?? 0;
    const ys = kr * r + kg * g + kb * b;
    const gain = (ys < HLG_OOTF_THRESH ? ys * HLG_OOTF_SLOPE : Math.pow(ys, 0.2)) * peakScale;
    out[idx] = r * gain;
    out[idx + 1] = g * gain;
    out[idx + 2] = b * gain;
    out[idx + 3] = 1.0;
  }
  return out;
}

// =============================================================================
// Browser decode helpers
// =============================================================================

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Bitmap options for gain map images: samples are data, never colour-managed. */
export const GAIN_MAP_BITMAP_OPTIONS: ImageBitmapOptions = { colorSpaceConversion: 'none' };

function createScratchCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function get2DContext(canvas: OffscreenCanvas | HTMLCanvasElement, colorSpace: PredefinedColorSpace): Canvas2D {
  const ctx = canvas.getContext('2d', { colorSpace, willReadFrequently: true }) as Canvas2D | null;
  if (!ctx) throw new Error('2D canvas context unavailable for gain map decode');
  return ctx;
}

/**
 * Read the RGBA8 pixels of a bitmap through a 2D canvas in `colorSpace`.
 * Returns the colour space the pixels are actually in (browsers without
 * wide-gamut canvases fall back to sRGB).
 */
function readBitmapPixels(
  bitmap: ImageBitmap,
  colorSpace: PredefinedColorSpace,
): { data: Uint8ClampedArray; colorSpace: PredefinedColorSpace } {
  const { width, height } = bitmap;
  const ctx = get2DContext(createScratchCanvas(width, height), colorSpace);
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, width, height, { colorSpace });
  return { data: img.data, colorSpace: img.colorSpace === 'display-p3' ? 'display-p3' : 'srgb' };
}

/**
 * Decode a gain map base image to linear float RGBA in its declared colour space.
 */
export async function decodeGainMapBase(blob: Blob, color: GainMapBaseColor | null): Promise<LinearGainMapBase> {
  const plan = planBaseDecode(color);
  const bitmap =
    plan.kind === 'raw'
      ? await createImageBitmap(blob, { colorSpaceConversion: 'none' })
      : await createImageBitmap(blob);
  try {
    const width = bitmap.width;
    const height = bitmap.height;
    if (plan.kind === 'raw') {
      const { data } = readBitmapPixels(bitmap, 'srgb');
      return {
        width,
        height,
        data: linearizeBasePixels(data, width * height, plan.transfer, plan.primaries),
        colorPrimaries: plan.primaries,
      };
    }
    const { data, colorSpace } = readBitmapPixels(bitmap, plan.canvasColorSpace);
    return {
      width,
      height,
      data: linearizeBasePixels(data, width * height, 'srgb'),
      colorPrimaries: colorSpace === 'display-p3' ? 'p3' : 'bt709',
    };
  } finally {
    bitmap.close();
  }
}

/**
 * Read a gain map bitmap (decoded with {@link GAIN_MAP_BITMAP_OPTIONS}) scaled
 * to the base size, with the base's orientation applied so samples line up.
 * Closes the bitmap.
 */
export function readGainMapPixels(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  orientation: number,
): Uint8ClampedArray {
  try {
    const ctx = get2DContext(createScratchCanvas(width, height), 'srgb');
    drawImageWithOrientation(ctx, bitmap, width, height, orientation);
    return ctx.getImageData(0, 0, width, height).data;
  } finally {
    bitmap.close();
  }
}

/**
 * Decode route for a base that arrives as raw code values (e.g. libheif WASM,
 * which applies no colour management): the declared transfer, or sRGB.
 */
export function rawBaseInterpretation(color: GainMapBaseColor | null): {
  transfer: GainMapBaseTransfer;
  primaries: ColorPrimaries;
} {
  const plan = planBaseDecode(color);
  if (plan.kind === 'raw') return { transfer: plan.transfer, primaries: plan.primaries };
  const p = color?.primaries;
  return { transfer: 'srgb', primaries: p === 'p3' || p === 'bt2020' ? p : 'bt709' };
}
