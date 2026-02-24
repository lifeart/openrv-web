/**
 * GainMapMetadata - Shared gain map metadata and HDR reconstruction
 *
 * Implements full ISO 21496-1 gain map specification:
 * - Complete XMP metadata parsing with rdf:Seq per-channel support
 * - AVIF tmap box conversion
 * - Fast-path for simple gain maps (Apple iPhone, simple Google photos)
 * - Full-path for complex gain maps (Adobe Lightroom, per-channel gamma/offsets)
 *
 * Single source of truth for sRGB-to-linear conversion (previously duplicated
 * in JPEG, AVIF, and HEIC decoders).
 */

import type { TmapMetadata } from './AVIFGainmapDecoder';

// =============================================================================
// Types
// =============================================================================

export interface GainMapMetadata {
  channelCount: 1 | 3;
  gainMapMin: number[];    // default [0]
  gainMapMax: number[];    // required (= headroom per channel)
  gamma: number[];         // default [1]
  offsetSDR: number[];     // default [0] (see rationale below)
  offsetHDR: number[];     // default [0]
  hdrCapacityMin: number;  // default 0
  hdrCapacityMax: number;  // required (= overall headroom)
  baseRenditionIsHDR: boolean; // default false
}

// =============================================================================
// sRGB to linear (single source of truth)
// =============================================================================

/**
 * sRGB to linear conversion (gamma decode).
 * Standard IEC 61966-2-1 transfer function.
 */
export function srgbToLinear(s: number): number {
  if (s <= 0.04045) {
    return s / 12.92;
  }
  return Math.pow((s + 0.055) / 1.055, 2.4);
}

// =============================================================================
// XMP parsing
// =============================================================================

/**
 * Parse a single numeric value from XMP attribute or element content.
 * Returns null if not found or not a valid finite number.
 */
function parseXMPFloat(xmpText: string, namespace: string, field: string): number | null {
  // Try attribute form: ns:Field="value"
  const attrRe = new RegExp(`${namespace}:${field}="([^"]+)"`, 'i');
  const attrMatch = xmpText.match(attrRe);
  if (attrMatch?.[1]) {
    const val = parseFloat(attrMatch[1]);
    if (Number.isFinite(val)) return val;
  }

  // Try element form: <ns:Field>value</ns:Field>
  const elemRe = new RegExp(`<${namespace}:${field}>\\s*([^<]+?)\\s*</${namespace}:${field}>`, 'i');
  const elemMatch = xmpText.match(elemRe);
  if (elemMatch?.[1]) {
    const val = parseFloat(elemMatch[1]);
    if (Number.isFinite(val)) return val;
  }

  return null;
}

/**
 * Parse a per-channel array from XMP using rdf:Seq, or fall back to scalar.
 * Returns null if not found.
 */
function parseXMPArray(xmpText: string, namespace: string, field: string): number[] | null {
  // Try rdf:Seq form:
  // <ns:Field><rdf:Seq><rdf:li>v1</rdf:li><rdf:li>v2</rdf:li><rdf:li>v3</rdf:li></rdf:Seq></ns:Field>
  const seqRe = new RegExp(
    `<${namespace}:${field}>\\s*<rdf:Seq>(.*?)</rdf:Seq>\\s*</${namespace}:${field}>`,
    'is'
  );
  const seqMatch = xmpText.match(seqRe);
  if (seqMatch?.[1]) {
    const liValues: number[] = [];
    const liRe = /<rdf:li>\s*([^<]+?)\s*<\/rdf:li>/gi;
    let liMatch;
    while ((liMatch = liRe.exec(seqMatch[1])) !== null) {
      const val = parseFloat(liMatch[1]!);
      if (!Number.isFinite(val)) return null;
      liValues.push(val);
    }
    if (liValues.length > 0) return liValues;
  }

  // Fall back to scalar
  const scalar = parseXMPFloat(xmpText, namespace, field);
  if (scalar !== null) return [scalar];

  return null;
}

/**
 * Parse a boolean from XMP attribute.
 */
function parseXMPBool(xmpText: string, namespace: string, field: string): boolean | null {
  const attrRe = new RegExp(`${namespace}:${field}="([^"]+)"`, 'i');
  const attrMatch = xmpText.match(attrRe);
  if (attrMatch?.[1]) {
    const v = attrMatch[1].toLowerCase();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
  }
  return null;
}

/**
 * Parse full gain map metadata from XMP text.
 * Supports both hdrgm namespace (Google/Adobe) and Apple headroom.
 *
 * Offset default rationale: The spec defaults OffsetSDR/OffsetHDR to 1/64,
 * but Apple iPhone images don't write these fields. Applying 1/64 would cause
 * a subtle brightness shift. We default to 0 when absent.
 */
export function parseGainMapMetadataFromXMP(xmpText: string): GainMapMetadata | null {
  // Check if this is an hdrgm or Apple HDR XMP
  const hasHdrgm = xmpText.includes('hdrgm:') || xmpText.includes('xmlns:hdrgm');
  const hasApple = /apple:hdrgainmapheadroom/i.test(xmpText);

  if (!hasHdrgm && !hasApple) return null;

  // Apple-only path: simple scalar headroom
  if (hasApple && !hasHdrgm) {
    const headroom = parseXMPFloat(xmpText, 'apple', 'hdrgainmapheadroom');
    if (headroom === null || headroom <= 0) return null;
    return defaultGainMapMetadata(headroom);
  }

  // hdrgm namespace parsing
  const gainMapMax = parseXMPArray(xmpText, 'hdrgm', 'GainMapMax');
  if (!gainMapMax || gainMapMax.length === 0) return null;

  const channelCount = gainMapMax.length >= 3 ? 3 : 1;

  const gainMapMin = parseXMPArray(xmpText, 'hdrgm', 'GainMapMin');
  const gamma = parseXMPArray(xmpText, 'hdrgm', 'Gamma');
  const offsetSDR = parseXMPArray(xmpText, 'hdrgm', 'OffsetSDR');
  const offsetHDR = parseXMPArray(xmpText, 'hdrgm', 'OffsetHDR');
  const hdrCapacityMin = parseXMPFloat(xmpText, 'hdrgm', 'HDRCapacityMin');
  const hdrCapacityMax = parseXMPFloat(xmpText, 'hdrgm', 'HDRCapacityMax');
  const baseRenditionIsHDR = parseXMPBool(xmpText, 'hdrgm', 'BaseRenditionIsHDR');

  // Expand arrays to channelCount
  function expand(arr: number[] | null, defaultVal: number): number[] {
    if (!arr) return new Array(channelCount).fill(defaultVal) as number[];
    if (arr.length >= channelCount) return arr.slice(0, channelCount);
    // Single value → repeat for all channels
    return new Array(channelCount).fill(arr[0]) as number[];
  }

  return {
    channelCount: channelCount as 1 | 3,
    gainMapMin: expand(gainMapMin, 0),
    gainMapMax: expand(gainMapMax, 0),
    gamma: expand(gamma, 1),
    offsetSDR: expand(offsetSDR, 0),
    offsetHDR: expand(offsetHDR, 0),
    hdrCapacityMin: hdrCapacityMin ?? 0,
    hdrCapacityMax: hdrCapacityMax ?? gainMapMax[0]!,
    baseRenditionIsHDR: baseRenditionIsHDR ?? false,
  };
}

// =============================================================================
// tmap conversion
// =============================================================================

/**
 * Convert AVIF tmap box metadata to GainMapMetadata.
 */
export function tmapToGainMapMetadata(tmap: TmapMetadata): GainMapMetadata {
  const channelCount = (tmap.channelCount >= 3 ? 3 : 1) as 1 | 3;
  const headroom = tmap.alternateHdrHeadroom > 0
    ? tmap.alternateHdrHeadroom
    : (tmap.gainMapMax.length > 0 && tmap.gainMapMax[0]! > 0 ? tmap.gainMapMax[0]! : 2.0);

  return {
    channelCount,
    gainMapMin: tmap.gainMapMin.slice(0, channelCount),
    gainMapMax: tmap.gainMapMax.slice(0, channelCount),
    gamma: tmap.gainMapGamma.slice(0, channelCount),
    offsetSDR: tmap.baseOffset.slice(0, channelCount),
    offsetHDR: tmap.alternateOffset.slice(0, channelCount),
    hdrCapacityMin: tmap.baseHdrHeadroom,
    hdrCapacityMax: headroom,
    baseRenditionIsHDR: false,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a simple GainMapMetadata from a scalar headroom value.
 * Used for Apple iPhone images and as a fallback.
 */
export function defaultGainMapMetadata(headroom: number): GainMapMetadata {
  return {
    channelCount: 1,
    gainMapMin: [0],
    gainMapMax: [headroom],
    gamma: [1],
    offsetSDR: [0],
    offsetHDR: [0],
    hdrCapacityMin: 0,
    hdrCapacityMax: headroom,
    baseRenditionIsHDR: false,
  };
}

/**
 * Detect whether a GainMapMetadata can use the fast LUT-based reconstruction path.
 *
 * Fast path conditions:
 * - channelCount === 1 (monochrome gain map)
 * - gainMapMin all zero
 * - gamma all 1
 * - offsetSDR all zero
 * - offsetHDR all zero
 * - baseRenditionIsHDR === false
 */
export function isSimpleGainMap(meta: GainMapMetadata): boolean {
  if (meta.channelCount !== 1) return false;
  if (meta.baseRenditionIsHDR) return false;

  for (let i = 0; i < meta.channelCount; i++) {
    if (meta.gainMapMin[i] !== 0) return false;
    if (meta.gamma[i] !== 1) return false;
    if (meta.offsetSDR[i] !== 0) return false;
    if (meta.offsetHDR[i] !== 0) return false;
  }

  return true;
}

// =============================================================================
// HDR reconstruction
// =============================================================================

/**
 * Unified HDR reconstruction from SDR base + gain map.
 *
 * Fast path (for simple Apple/Google photos): LUT-based, identical to previous behavior.
 * Full path (ISO 21496-1): Per-channel gamma, offsets, and gainMapMin support.
 *
 * Weight factor is hardcoded to 1.0 (maximum HDR, correct for VFX viewer).
 *
 * @param baseData - SDR base image pixel data (uint8 RGBA)
 * @param gainData - Gain map pixel data (uint8 RGBA, only R used for 1-channel)
 * @param pixelCount - Number of pixels
 * @param meta - Gain map metadata
 * @returns Float32Array of RGBA linear HDR pixel data
 */
export function reconstructHDR(
  baseData: Uint8ClampedArray,
  gainData: Uint8ClampedArray,
  pixelCount: number,
  meta: GainMapMetadata,
): Float32Array {
  const result = new Float32Array(pixelCount * 4);

  // Pre-compute sRGB-to-linear LUT for uint8 values (0-255)
  const srgbLUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    srgbLUT[i] = srgbToLinear(i / 255.0);
  }

  if (isSimpleGainMap(meta)) {
    // Fast path: identical to previous LUT-based approach
    const headroom = meta.gainMapMax[0]!;
    const gainLUT = new Float32Array(256);
    const headroomLN2 = headroom * Math.LN2;
    for (let i = 0; i < 256; i++) {
      gainLUT[i] = Math.exp((i / 255.0) * headroomLN2);
    }

    for (let i = 0; i < pixelCount; i++) {
      const srcIdx = i * 4;
      const dstIdx = i * 4;

      const r = srgbLUT[baseData[srcIdx]!]!;
      const g = srgbLUT[baseData[srcIdx + 1]!]!;
      const b = srgbLUT[baseData[srcIdx + 2]!]!;

      const gain = gainLUT[gainData[srcIdx]!]!;

      result[dstIdx] = r * gain;
      result[dstIdx + 1] = g * gain;
      result[dstIdx + 2] = b * gain;
      result[dstIdx + 3] = 1.0;
    }
  } else {
    // Full path: ISO 21496-1 formula
    // log_recovery = pow(gainmap / 255, 1/Gamma)
    // log_boost = GainMapMin * (1 - log_recovery) + GainMapMax * log_recovery
    // HDR = (sdr_linear + OffsetSDR) * 2^(log_boost) - OffsetHDR

    const ch = meta.channelCount;

    // Pre-compute per-channel gamma LUTs (ch × 256 entries)
    const gammaLUTs: Float32Array[] = [];
    for (let c = 0; c < ch; c++) {
      const lut = new Float32Array(256);
      const invGamma = meta.gamma[c]! !== 0 ? 1.0 / meta.gamma[c]! : 1.0;
      for (let i = 0; i < 256; i++) {
        lut[i] = Math.pow(i / 255.0, invGamma);
      }
      gammaLUTs.push(lut);
    }

    for (let i = 0; i < pixelCount; i++) {
      const srcIdx = i * 4;
      const dstIdx = i * 4;

      // sRGB to linear
      const sdrR = srgbLUT[baseData[srcIdx]!]!;
      const sdrG = srgbLUT[baseData[srcIdx + 1]!]!;
      const sdrB = srgbLUT[baseData[srcIdx + 2]!]!;
      const sdrLinear = [sdrR, sdrG, sdrB];

      for (let c = 0; c < 3; c++) {
        const gainChannel = ch === 1 ? 0 : c;
        const gainValue = gainData[srcIdx + gainChannel]!;

        const logRecovery = gammaLUTs[gainChannel]![gainValue]!;
        const logBoost = meta.gainMapMin[gainChannel]! * (1.0 - logRecovery)
          + meta.gainMapMax[gainChannel]! * logRecovery;

        const hdr = (sdrLinear[c]! + meta.offsetSDR[gainChannel]!) * Math.pow(2, logBoost)
          - meta.offsetHDR[gainChannel]!;

        result[dstIdx + c] = hdr;
      }

      result[dstIdx + 3] = 1.0;
    }
  }

  return result;
}
