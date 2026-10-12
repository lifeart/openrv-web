/**
 * GainMapMetadata - Shared gain map metadata and HDR reconstruction
 *
 * Implements ISO 21496-1 / Adobe gain map application:
 * - Complete XMP metadata parsing with rdf:Seq per-channel support
 * - ISO 21496-1 binary metadata (AVIF/HEIC 'tmap' item, JPEG APP2) parsing
 * - Per-channel gainMapMin/Max, gamma, offsetSDR/offsetHDR
 * - Weighting factor W from hdrCapacityMin/Max and a target display headroom
 * - baseRenditionIsHDR (base is the HDR rendition, the map leads down to SDR)
 *
 * Linear convention: the reconstructed values use 1.0 = SDR / HDR reference
 * white (203 cd/m², ITU-R BT.2408), the same as every other HDR source in the
 * app. Gain map headroom is defined relative to that white, so an SDR base
 * linearised to [0, 1] needs no further scaling.
 *
 * Single source of truth for sRGB-to-linear conversion (previously duplicated
 * in JPEG, AVIF, and HEIC decoders).
 */

// =============================================================================
// Types
// =============================================================================

export interface GainMapMetadata {
  channelCount: 1 | 3;
  gainMapMin: number[]; // default [0]
  gainMapMax: number[]; // required (= headroom per channel)
  gamma: number[]; // default [1]
  offsetSDR: number[]; // default [0] (see rationale below)
  offsetHDR: number[]; // default [0]
  hdrCapacityMin: number; // default 0
  hdrCapacityMax: number; // required (= overall headroom)
  baseRenditionIsHDR: boolean; // default false
}

/**
 * ISO 21496-1 gain map metadata as stored in the binary form (AVIF/HEIC
 * 'tmap' item, JPEG APP2 'urn:iso:std:iso:ts:21496:-1'), decoded from the
 * numerator/denominator pairs. Unlike {@link GainMapMetadata}, the fields are
 * expressed relative to the base and alternate renditions: the base is HDR
 * when baseHdrHeadroom > alternateHdrHeadroom.
 */
export interface TmapMetadata {
  channelCount: number;
  gainMapMin: number[];
  gainMapMax: number[];
  gainMapGamma: number[];
  baseOffset: number[];
  alternateOffset: number[];
  baseHdrHeadroom: number;
  alternateHdrHeadroom: number;
  /** use_base_colour_space flag (ISO binary form only). */
  useBaseColorSpace?: boolean;
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
  const seqRe = new RegExp(`<${namespace}:${field}>\\s*<rdf:Seq>(.*?)</rdf:Seq>\\s*</${namespace}:${field}>`, 'is');
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
  const elemRe = new RegExp(`<${namespace}:${field}>\\s*([^<]+?)\\s*</${namespace}:${field}>`, 'i');
  const raw = xmpText.match(attrRe)?.[1] ?? xmpText.match(elemRe)?.[1];
  if (raw) {
    const v = raw.toLowerCase();
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
// ISO 21496-1 binary metadata
// =============================================================================

/** is_multichannel: three gain map channels instead of one. */
const ISO_FLAG_MULTICHANNEL = 0x80;
/** use_base_colour_space: apply the map in the base image's colour space. */
const ISO_FLAG_USE_BASE_COLOUR_SPACE = 0x40;
/** use_common_denominator: one shared denominator, then numerators only (libultrahdr). */
const ISO_FLAG_COMMON_DENOMINATOR = 0x08;

/**
 * Parse the ISO 21496-1 gain map metadata binary form, starting at
 * `minimum_version`. Used as-is by JPEG (APP2 after the URN), and after a
 * one-byte version by the AVIF/HEIC 'tmap' item ({@link parseTmapItemPayload}).
 *
 * Layout (big-endian):
 *   u16 minimum_version (must be 0), u16 writer_version
 *   u8  flags: is_multichannel (0x80), use_base_colour_space (0x40),
 *       use_common_denominator (0x08)
 *   common denominator form:
 *     u32 common_denominator, u32 base_hdr_headroom_n, u32 alternate_hdr_headroom_n,
 *     per channel: i32 gain_map_min_n, i32 gain_map_max_n, u32 gamma_n,
 *                  i32 base_offset_n, i32 alternate_offset_n
 *   otherwise:
 *     u32 base_hdr_headroom n/d, u32 alternate_hdr_headroom n/d,
 *     per channel: i32/u32 gain_map_min, i32/u32 gain_map_max, u32/u32 gamma,
 *                  i32/u32 base_offset, i32/u32 alternate_offset
 *
 * Returns null on truncation, an unsupported minimum_version, a zero
 * denominator or a non-positive gamma.
 */
export function parseISO21496Metadata(view: DataView, start: number, end: number): TmapMetadata | null {
  let pos = start;
  if (pos + 5 > end) return null;
  const minimumVersion = view.getUint16(pos);
  pos += 4; // minimum_version + writer_version
  if (minimumVersion !== 0) return null;
  const flags = view.getUint8(pos);
  pos += 1;
  const channelCount = flags & ISO_FLAG_MULTICHANNEL ? 3 : 1;
  const useBaseColorSpace = (flags & ISO_FLAG_USE_BASE_COLOUR_SPACE) !== 0;
  const commonDenominator = (flags & ISO_FLAG_COMMON_DENOMINATOR) !== 0;

  const readU32 = (): number | null => {
    if (pos + 4 > end) return null;
    const v = view.getUint32(pos);
    pos += 4;
    return v;
  };
  const readI32 = (): number | null => {
    if (pos + 4 > end) return null;
    const v = view.getInt32(pos);
    pos += 4;
    return v;
  };
  const ratio = (n: number | null, d: number | null): number | null => (n === null || !d ? null : n / d);

  const gainMapMin: number[] = [];
  const gainMapMax: number[] = [];
  const gainMapGamma: number[] = [];
  const baseOffset: number[] = [];
  const alternateOffset: number[] = [];
  let baseHdrHeadroom: number | null;
  let alternateHdrHeadroom: number | null;

  if (commonDenominator) {
    const d = readU32();
    baseHdrHeadroom = ratio(readU32(), d);
    alternateHdrHeadroom = ratio(readU32(), d);
    for (let c = 0; c < channelCount; c++) {
      const min = ratio(readI32(), d);
      const max = ratio(readI32(), d);
      const gamma = ratio(readU32(), d);
      const base = ratio(readI32(), d);
      const alt = ratio(readI32(), d);
      if (min === null || max === null || gamma === null || base === null || alt === null) return null;
      gainMapMin.push(min);
      gainMapMax.push(max);
      gainMapGamma.push(gamma);
      baseOffset.push(base);
      alternateOffset.push(alt);
    }
  } else {
    baseHdrHeadroom = ratio(readU32(), readU32());
    alternateHdrHeadroom = ratio(readU32(), readU32());
    for (let c = 0; c < channelCount; c++) {
      const min = ratio(readI32(), readU32());
      const max = ratio(readI32(), readU32());
      const gamma = ratio(readU32(), readU32());
      const base = ratio(readI32(), readU32());
      const alt = ratio(readI32(), readU32());
      if (min === null || max === null || gamma === null || base === null || alt === null) return null;
      gainMapMin.push(min);
      gainMapMax.push(max);
      gainMapGamma.push(gamma);
      baseOffset.push(base);
      alternateOffset.push(alt);
    }
  }

  if (baseHdrHeadroom === null || alternateHdrHeadroom === null) return null;
  if (gainMapGamma.some((g) => !(g > 0))) return null;

  return {
    channelCount,
    gainMapMin,
    gainMapMax,
    gainMapGamma,
    baseOffset,
    alternateOffset,
    baseHdrHeadroom,
    alternateHdrHeadroom,
    useBaseColorSpace,
  };
}

/**
 * Parse the payload of an AVIF/HEIC 'tmap' derived image item:
 * u8 version (0) followed by the ISO 21496-1 binary metadata.
 */
export function parseTmapItemPayload(view: DataView, start: number, end: number): TmapMetadata | null {
  if (start + 1 > end || view.getUint8(start) !== 0) return null;
  return parseISO21496Metadata(view, start + 1, end);
}

/**
 * Convert ISO 21496-1 (tmap) metadata to GainMapMetadata.
 *
 * GainMapMetadata uses the Adobe/hdrgm convention: the map always encodes
 * log2(HDR / SDR) and hdrCapacityMin/Max are the SDR/HDR headrooms. ISO
 * metadata encodes log2(alternate / base) instead, so when the base is the
 * HDR rendition (baseHdrHeadroom > alternateHdrHeadroom) the map values are
 * negated, the offsets and headrooms swap sides, and baseRenditionIsHDR is set.
 * {@link applyGainMap} then reproduces the ISO result exactly.
 */
export function tmapToGainMapMetadata(tmap: TmapMetadata): GainMapMetadata {
  const channelCount = (tmap.channelCount >= 3 ? 3 : 1) as 1 | 3;
  const fit = (arr: number[], fallback: number): number[] =>
    arr.length >= channelCount
      ? arr.slice(0, channelCount)
      : (new Array(channelCount).fill(arr[0] ?? fallback) as number[]);

  if (tmap.baseHdrHeadroom > tmap.alternateHdrHeadroom) {
    return {
      channelCount,
      gainMapMin: fit(tmap.gainMapMin, 0).map((v) => -v),
      gainMapMax: fit(tmap.gainMapMax, 0).map((v) => -v),
      gamma: fit(tmap.gainMapGamma, 1),
      offsetSDR: fit(tmap.alternateOffset, 0),
      offsetHDR: fit(tmap.baseOffset, 0),
      hdrCapacityMin: tmap.alternateHdrHeadroom,
      hdrCapacityMax: tmap.baseHdrHeadroom,
      baseRenditionIsHDR: true,
    };
  }

  const headroom =
    tmap.alternateHdrHeadroom > 0
      ? tmap.alternateHdrHeadroom
      : tmap.gainMapMax.length > 0 && tmap.gainMapMax[0]! > 0
        ? tmap.gainMapMax[0]!
        : 2.0;

  return {
    channelCount,
    gainMapMin: fit(tmap.gainMapMin, 0),
    gainMapMax: fit(tmap.gainMapMax, 0),
    gamma: fit(tmap.gainMapGamma, 1),
    offsetSDR: fit(tmap.baseOffset, 0),
    offsetHDR: fit(tmap.alternateOffset, 0),
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
 * Detect whether a GainMapMetadata is the simple single-scalar form written by
 * Apple iPhone and simple Google photos (HDR = base * 2^(v * headroom)).
 * Informational: {@link applyGainMap} handles every form with the same tables.
 *
 * Conditions:
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
 * ISO 21496-1 / Adobe weighting factor for a target display headroom.
 *
 *   W = clamp((log2(H) - hdrCapacityMin) / (hdrCapacityMax - hdrCapacityMin), 0, 1)
 *
 * W = 0 selects the SDR rendition and W = 1 the full HDR rendition, whichever
 * of the two is the base. `displayHeadroom` is a linear ratio of peak to SDR
 * white (Viewer.getHDRHeadroom() units, 1 = SDR display). Undefined means "no
 * display limit": the full HDR rendition (W = 1).
 */
export function computeGainMapWeight(meta: GainMapMetadata, displayHeadroom?: number): number {
  if (displayHeadroom === undefined || !Number.isFinite(displayHeadroom)) return 1;
  const h = Math.log2(Math.max(displayHeadroom, 1));
  const lo = meta.hdrCapacityMin;
  const hi = meta.hdrCapacityMax;
  if (!(hi > lo)) return h >= hi ? 1 : 0;
  return Math.min(Math.max((h - lo) / (hi - lo), 0), 1);
}

/**
 * Apply a gain map to a linear base image, in place.
 *
 * Per channel c, with the gain map sample v in [0, 1]:
 *   r       = v^(1 / gamma[c])
 *   G       = gainMapMin[c] * (1 - r) + gainMapMax[c] * r        (log2 HDR/SDR)
 *   SDR base: out = (base + offsetSDR[c]) * 2^(G * W)       - offsetHDR[c]
 *   HDR base: out = (base + offsetHDR[c]) * 2^(G * (W - 1)) - offsetSDR[c]
 *
 * A single-channel map drives all three colour channels. Alpha is untouched.
 *
 * @param base - Linear RGBA base pixels (1.0 = SDR white); overwritten with the result
 * @param gainData - Gain map pixels (uint8 RGBA, same size as base; R only for 1 channel)
 * @param pixelCount - Number of pixels
 * @param meta - Gain map metadata (hdrgm convention)
 * @param weight - W in [0, 1], see {@link computeGainMapWeight}; default 1 (full HDR)
 * @returns `base`
 */
export function applyGainMap(
  base: Float32Array,
  gainData: Uint8ClampedArray,
  pixelCount: number,
  meta: GainMapMetadata,
  weight = 1,
): Float32Array {
  const w = Number.isFinite(weight) ? Math.min(Math.max(weight, 0), 1) : 1;
  const exponentScale = meta.baseRenditionIsHDR ? w - 1 : w;
  const multichannel = meta.channelCount === 3;

  // Per gain map channel: a 256-entry multiplier table 2^(G(v) * exponentScale)
  // and the offsets added before / subtracted after it.
  const channel = (c: number): { lut: Float32Array; kIn: number; kOut: number } => {
    const gamma = meta.gamma[c] ?? meta.gamma[0] ?? 1;
    const invGamma = gamma > 0 && Number.isFinite(gamma) ? 1 / gamma : 1;
    const min = meta.gainMapMin[c] ?? meta.gainMapMin[0] ?? 0;
    const max = meta.gainMapMax[c] ?? meta.gainMapMax[0] ?? 0;
    const lut = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const r = Math.pow(i / 255, invGamma);
      lut[i] = Math.pow(2, (min * (1 - r) + max * r) * exponentScale);
    }
    const sdr = meta.offsetSDR[c] ?? meta.offsetSDR[0] ?? 0;
    const hdr = meta.offsetHDR[c] ?? meta.offsetHDR[0] ?? 0;
    return meta.baseRenditionIsHDR ? { lut, kIn: hdr, kOut: sdr } : { lut, kIn: sdr, kOut: hdr };
  };

  // A single-channel map feeds all three colour channels from its first sample.
  const red = channel(0);
  const green = multichannel ? channel(1) : red;
  const blue = multichannel ? channel(2) : red;
  const { lut: lutR, kIn: inR, kOut: outR } = red;
  const { lut: lutG, kIn: inG, kOut: outG } = green;
  const { lut: lutB, kIn: inB, kOut: outB } = blue;
  const gOff = multichannel ? 1 : 0;
  const bOff = multichannel ? 2 : 0;

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    base[idx] = ((base[idx] ?? 0) + inR) * (lutR[gainData[idx] ?? 0] ?? 1) - outR;
    base[idx + 1] = ((base[idx + 1] ?? 0) + inG) * (lutG[gainData[idx + gOff] ?? 0] ?? 1) - outG;
    base[idx + 2] = ((base[idx + 2] ?? 0) + inB) * (lutB[gainData[idx + bOff] ?? 0] ?? 1) - outB;
  }

  return base;
}

/** Options for {@link reconstructHDR}. */
export interface ReconstructHDROptions {
  /** Weighting factor W in [0, 1]; default 1 (full HDR rendition). */
  weight?: number;
}

/**
 * HDR reconstruction from an 8-bit sRGB-encoded base + gain map.
 *
 * Decoders that know the base's real transfer and primaries linearise it
 * themselves (GainMapColor.linearizeBasePixels) and call {@link applyGainMap};
 * this helper keeps the sRGB-base convenience path.
 *
 * Weight defaults to 1 (full HDR rendition): reconstruction happens once at
 * decode time, and the viewer's tone mapping and display headroom adapt the
 * result to the display.
 *
 * @param baseData - Base image pixel data (uint8 RGBA, sRGB transfer)
 * @param gainData - Gain map pixel data (uint8 RGBA, only R used for 1-channel)
 * @param pixelCount - Number of pixels
 * @param meta - Gain map metadata
 * @returns Float32Array of RGBA linear HDR pixel data (1.0 = SDR white)
 */
export function reconstructHDR(
  baseData: Uint8ClampedArray,
  gainData: Uint8ClampedArray,
  pixelCount: number,
  meta: GainMapMetadata,
  options: ReconstructHDROptions = {},
): Float32Array {
  const result = new Float32Array(pixelCount * 4);

  const srgbLUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    srgbLUT[i] = srgbToLinear(i / 255.0);
  }
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    result[idx] = srgbLUT[baseData[idx] ?? 0] ?? 0;
    result[idx + 1] = srgbLUT[baseData[idx + 1] ?? 0] ?? 0;
    result[idx + 2] = srgbLUT[baseData[idx + 2] ?? 0] ?? 0;
    result[idx + 3] = 1.0;
  }

  return applyGainMap(result, gainData, pixelCount, meta, options.weight ?? 1);
}
