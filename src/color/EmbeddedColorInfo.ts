/**
 * EmbeddedColorInfo - lightweight reading of colour information embedded in
 * image files: CICP code points (ITU-T H.273, as carried by PNG cICP chunks,
 * ISOBMFF colr/nclx boxes and ICC v4.4 'cicp' tags) and ICC profiles.
 *
 * This is labelling, not colour management: an ICC profile is identified by
 * its 'cicp' tag, else by its colorant primaries (rXYZ/gXYZ/bXYZ, compared
 * with known primaries), else by its 'desc' text. No full ICC CMM is run;
 * the renderer's primaries/transfer conversion does the rest.
 */

import type { ColorPrimaries, TransferFunction } from '../core/image/Image';
import { parseICCProfile } from './ICCProfile';
import {
  CHROMATICITIES,
  chromaticitiesFromICCMatrix,
  identifyChromaticities,
  primariesMetadataFromChromaticities,
} from './ColorPrimariesMath';

export interface EmbeddedColorInfo {
  /** Named primaries (renderer fast path). */
  colorPrimaries?: ColorPrimaries;
  /** Chromaticities for primaries without a named value. */
  chromaticities?: number[];
  transferFunction?: TransferFunction;
}

/** CICP code points (H.273). */
export interface CICP {
  primaries: number;
  transfer: number;
  matrix: number;
  fullRange: boolean;
}

// H.273 ColourPrimaries with chromaticities [Rx, Ry, Gx, Gy, Bx, By, Wx, Wy]
const CICP_PRIMARIES: Record<number, readonly number[]> = {
  1: CHROMATICITIES.bt709,
  4: [0.67, 0.33, 0.21, 0.71, 0.14, 0.08, 0.31, 0.316], // BT.470 System M
  5: [0.64, 0.33, 0.29, 0.6, 0.15, 0.06, 0.3127, 0.329], // BT.601 625 / BT.470 BG
  6: [0.63, 0.34, 0.31, 0.595, 0.155, 0.07, 0.3127, 0.329], // BT.601 525
  7: [0.63, 0.34, 0.31, 0.595, 0.155, 0.07, 0.3127, 0.329], // SMPTE 240M
  8: [0.681, 0.319, 0.243, 0.692, 0.145, 0.049, 0.31, 0.316], // Generic film (Illuminant C)
  9: CHROMATICITIES.bt2020,
  10: CHROMATICITIES.cieXYZ, // SMPTE ST 428-1 (CIE XYZ)
  11: CHROMATICITIES.dciP3, // SMPTE RP 431-2
  12: CHROMATICITIES.p3, // SMPTE EG 432-1 (Display P3)
  22: [0.63, 0.34, 0.295, 0.605, 0.155, 0.077, 0.3127, 0.329], // EBU Tech 3213
};

/** Primaries metadata for an H.273 ColourPrimaries code; {} for unspecified / unknown. */
export function primariesFromCICP(code: number): Pick<EmbeddedColorInfo, 'colorPrimaries' | 'chromaticities'> {
  if (code === 1) return { colorPrimaries: 'bt709' };
  const c = CICP_PRIMARIES[code];
  return c ? primariesMetadataFromChromaticities(c) : {};
}

/**
 * Transfer function for an H.273 TransferCharacteristics code; undefined for
 * unspecified / unsupported codes. The BT.709-family OETFs (1, 6, 14, 15) are
 * displayed with the sRGB curve, like other SDR content in this pipeline.
 */
export function transferFromCICP(code: number): TransferFunction | undefined {
  switch (code) {
    case 16:
      return 'pq';
    case 18:
      return 'hlg';
    case 8:
      return 'linear';
    case 7:
      return 'smpte240m';
    case 1:
    case 6:
    case 13:
    case 14:
    case 15:
      return 'srgb';
    default:
      return undefined;
  }
}

export function colorInfoFromCICP(cicp: Pick<CICP, 'primaries' | 'transfer'>): EmbeddedColorInfo {
  const info: EmbeddedColorInfo = { ...primariesFromCICP(cicp.primaries) };
  const tf = transferFromCICP(cicp.transfer);
  if (tf) info.transferFunction = tf;
  return info;
}

/** True for PQ / HLG transfer functions. */
export function isHDRTransfer(tf: TransferFunction | undefined): tf is 'pq' | 'hlg' {
  return tf === 'pq' || tf === 'hlg';
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Read the cICP chunk (PNG 3rd edition) of a PNG file. Only chunks before
 * IDAT are scanned, as the spec requires cICP to precede the image data.
 * Returns null when the file is not a PNG or has no cICP chunk.
 */
export function parsePNGcICP(buffer: ArrayBuffer): CICP | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(buffer);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    const data = offset + 8;
    if (data + length > bytes.length) return null;
    if (type === 'cICP') {
      if (length !== 4) return null;
      return {
        primaries: bytes[data] ?? 0,
        transfer: bytes[data + 1] ?? 0,
        matrix: bytes[data + 2] ?? 0,
        fullRange: bytes[data + 3] === 1,
      };
    }
    if (type === 'IDAT' || type === 'IEND') return null;
    offset = data + length + 4; // + CRC
  }
  return null;
}

// ---------------------------------------------------------------------------
// ICC
// ---------------------------------------------------------------------------

function sig(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * Read the text from an ICC 'desc' (profileDescriptionTag) or 'mluc' tag.
 * `start`/`end` are absolute offsets of the tag data in `view`.
 */
export function readICCDescriptionTag(view: DataView, start: number, end: number): string {
  if (start + 8 > end) return '';
  const typeSig = sig(view, start);

  // 'desc' type (ICC v2): type(4) + reserved(4) + length(4) + ASCII string
  if (typeSig === 'desc') {
    if (start + 12 > end) return '';
    const strLen = view.getUint32(start + 8);
    const strStart = start + 12;
    const strEnd = Math.min(strStart + strLen, end);
    const chars: string[] = [];
    for (let i = strStart; i < strEnd; i++) {
      const c = view.getUint8(i);
      if (c === 0) break;
      chars.push(String.fromCharCode(c));
    }
    return chars.join('');
  }

  // 'mluc' type (ICC v4): multi-localized Unicode
  if (typeSig === 'mluc') {
    if (start + 28 > end) return '';
    const recordCount = view.getUint32(start + 8);
    if (recordCount === 0) return '';
    // First record: language(2) + country(2) + length(4) + offset(4) at start+16
    const strLength = view.getUint32(start + 20);
    const strOffset = view.getUint32(start + 24);
    const strStart = start + strOffset;
    const strEnd = Math.min(strStart + strLength, end);
    // mluc stores UTF-16BE strings
    const chars: string[] = [];
    for (let i = strStart; i + 1 < strEnd; i += 2) {
      const code = view.getUint16(i);
      if (code === 0) break;
      chars.push(String.fromCharCode(code));
    }
    return chars.join('');
  }

  return '';
}

export interface ICCColorInfo extends EmbeddedColorInfo {
  /** Profile description text ('desc' tag), if any. */
  description: string;
  /** CICP from the ICC v4.4 'cicp' tag, if any. */
  cicp?: CICP;
  /** Where the primaries came from. */
  primariesSource?: 'cicp' | 'colorants' | 'description';
}

/**
 * Identify the colour space of an ICC profile without a CMM.
 * Primaries: 'cicp' tag, else rXYZ/gXYZ/bXYZ colorants (via 'chad' when
 * present), else 'desc' text ("Display P3", "BT.2020"). Transfer: 'cicp' tag
 * only (PQ/HLG keyword matching is left to callers). Returns null for data
 * too short to hold an ICC header and tag count.
 */
export function colorInfoFromICC(profile: ArrayBuffer): ICCColorInfo | null {
  if (profile.byteLength < 132) return null;
  const view = new DataView(profile);
  // The tag table is read even without the 'acsp' signature (some encoders
  // write sloppy headers); colorants need a well-formed profile.

  const info: ICCColorInfo = { description: '' };
  const tagCount = Math.min(view.getUint32(128), 200);
  for (let i = 0; i < tagCount; i++) {
    const entry = 132 + i * 12;
    if (entry + 12 > profile.byteLength) break;
    const tag = sig(view, entry);
    const start = view.getUint32(entry + 4);
    const size = view.getUint32(entry + 8);
    const end = start + size;
    if (end > profile.byteLength || start >= profile.byteLength) continue;
    if (tag === 'desc') {
      info.description = readICCDescriptionTag(view, start, end);
    } else if (tag === 'cicp' && size >= 12 && sig(view, start) === 'cicp') {
      info.cicp = {
        primaries: view.getUint8(start + 8),
        transfer: view.getUint8(start + 9),
        matrix: view.getUint8(start + 10),
        fullRange: view.getUint8(start + 11) === 1,
      };
    }
  }

  if (info.cicp) {
    const fromCicp = colorInfoFromCICP(info.cicp);
    Object.assign(info, fromCicp);
    if (fromCicp.colorPrimaries || fromCicp.chromaticities) info.primariesSource = 'cicp';
  }

  if (!info.primariesSource) {
    const parsed = parseICCProfile(profile);
    const chroma = parsed?.rgbToXYZMatrix
      ? chromaticitiesFromICCMatrix(parsed.rgbToXYZMatrix, parsed.chromaticAdaptationMatrix)
      : null;
    if (chroma) {
      // ICC colorants are s15Fixed16 and often rounded by the profile maker.
      const name = identifyChromaticities(chroma, 0.01);
      if (name === 'bt709' || name === 'p3' || name === 'bt2020') {
        info.colorPrimaries = name;
      } else if (name) {
        info.chromaticities = [...CHROMATICITIES[name]];
      } else {
        info.chromaticities = Array.from(chroma);
      }
      info.primariesSource = 'colorants';
    }
  }

  if (!info.primariesSource) {
    const desc = info.description;
    if (/\b(bt\.?|rec\.?\s*)2020\b/i.test(desc) || /\b2100\b/.test(desc)) {
      info.colorPrimaries = 'bt2020';
      info.primariesSource = 'description';
    } else if (/\bdisplay\s*p3\b/i.test(desc) || /\bp3\b/i.test(desc)) {
      info.colorPrimaries = 'p3';
      info.primariesSource = 'description';
    }
  }

  return info;
}

/** True when the info describes a gamut wider than BT.709 that the renderer can convert. */
export function isWideGamut(info: EmbeddedColorInfo): boolean {
  if (info.colorPrimaries === 'p3' || info.colorPrimaries === 'bt2020') return true;
  if (!info.chromaticities) return false;
  const name = identifyChromaticities(info.chromaticities, 0.01);
  return name === 'dciP3' || name === 'acesAP1' || name === 'acesAP0';
}
