/**
 * FileSourceNode - Source node for single image files
 *
 * Loads and provides a single image as source data.
 * Supports standard web formats (PNG, JPEG, WebP) and HDR formats (EXR, DPX, Cineon, Float TIFF, Radiance HDR).
 */

import { BaseSourceNode } from './BaseSourceNode';
import { IPImage, ImageMetadata, TransferFunction, ColorPrimaries } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { RegisterNode } from '../base/NodeFactory';
import type {
  EXRLayerInfo,
  EXRDecodeOptions,
  EXRChannelRemapping,
} from '../../formats/EXRDecoder';
import { decoderRegistry } from '../../formats/DecoderRegistry';
import type { HEICGainmapInfo, HEICColorInfo } from '../../formats/HEICGainmapDecoder';
import { isRAWExtension } from '../../formats/RAWPreviewDecoder';
import type { RAWExifMetadata } from '../../formats/RAWPreviewDecoder';

/**
 * Check if a filename has an EXR extension
 */
function isEXRExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'exr' || ext === 'sxr';
}

/**
 * Check if a filename has a DPX extension
 */
function isDPXExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'dpx';
}

/**
 * Check if a filename has a Cineon extension
 */
function isCineonExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'cin' || ext === 'cineon';
}

/**
 * Check if a filename has a TIFF extension
 */
function isTIFFExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'tiff' || ext === 'tif';
}

/**
 * Check if a filename has a Radiance HDR extension.
 * Note: .pic is ambiguous (also used by Softimage PIC, Apple PICT, etc.)
 * but magic-byte validation in the decoder prevents silent mis-decode.
 */
function isHDRExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'hdr' || ext === 'pic';
}

/**
 * Check if a filename has a JPEG extension
 */
function isJPEGExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'jpg' || ext === 'jpeg' || ext === 'jpe';
}

/**
 * Check if a filename has an AVIF extension
 */
function isAVIFExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'avif';
}

/**
 * Check if a filename has a JXL extension
 */
function isJXLExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'jxl';
}

/**
 * Check if a filename has a HEIC/HEIF extension
 */
function isHEICExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'heic' || ext === 'heif';
}

/**
 * Check if a filename has a JPEG 2000 / HTJ2K extension
 */
function isJP2Extension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'jp2' || ext === 'j2k' || ext === 'j2c' || ext === 'jph' || ext === 'jhc';
}

/**
 * Check if an ArrayBuffer contains an AVIF file (ISOBMFF ftyp box with AVIF brand)
 */
function isAVIFFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  // Box type at offset 4..7 must be 'ftyp'
  const type = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7));
  if (type !== 'ftyp') return false;
  // Major brand at offset 8..11
  const brand = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  return brand === 'avif' || brand === 'avis' || brand === 'mif1';
}

interface AVIFColorInfo {
  transferFunction: TransferFunction;
  colorPrimaries: ColorPrimaries;
  isHDR: boolean;
}

/**
 * Parse AVIF ISOBMFF box hierarchy to extract color info from colr(nclx) box.
 * Path: ftyp → meta → iprp → ipco → colr(nclx)
 *
 * Returns null if no nclx colour info found (treat as SDR).
 */
function parseAVIFColorInfo(buffer: ArrayBuffer): AVIFColorInfo | null {
  const view = new DataView(buffer);
  const length = buffer.byteLength;

  /**
   * Find a box by type within a range, returning its content offset and size.
   * For FullBox types (like 'meta'), set isFullBox=true to skip 4 extra bytes.
   */
  function findBox(
    type: string,
    start: number,
    end: number,
    isFullBox = false
  ): { contentStart: number; contentEnd: number } | null {
    let offset = start;
    while (offset + 8 <= end) {
      const boxSize = view.getUint32(offset);
      const boxType = String.fromCharCode(
        view.getUint8(offset + 4),
        view.getUint8(offset + 5),
        view.getUint8(offset + 6),
        view.getUint8(offset + 7)
      );

      if (boxSize < 8 || offset + boxSize > end) break;

      if (boxType === type) {
        const headerSize = isFullBox ? 12 : 8; // FullBox has 4 extra bytes (version + flags)
        return {
          contentStart: offset + headerSize,
          contentEnd: offset + boxSize,
        };
      }

      offset += boxSize;
    }
    return null;
  }

  // Skip past ftyp box to find top-level meta box
  if (length < 12) { return null; }
  const ftypSize = view.getUint32(0);
  if (ftypSize < 8 || ftypSize > length) { return null; }

  // Find 'meta' box (FullBox - has version+flags)
  const meta = findBox('meta', ftypSize, length, true);
  if (!meta) { return null; }

  // Find 'iprp' box inside meta (plain container)
  const iprp = findBox('iprp', meta.contentStart, meta.contentEnd);
  if (!iprp) { return null; }

  // Find 'ipco' box inside iprp (plain container)
  const ipco = findBox('ipco', iprp.contentStart, iprp.contentEnd);
  if (!ipco) { return null; }

  // Scan ALL 'colr' boxes inside ipco — AVIF files may have multiple
  // (e.g. ICC profile 'prof'/'ricc' + coded 'nclx'). Collect nclx and ICC profile data.
  let nclxColr: { contentStart: number; contentEnd: number } | null = null;
  let iccProfileStart = -1;
  let iccProfileEnd = -1;
  {
    let scanOffset = ipco.contentStart;
    while (scanOffset + 8 <= ipco.contentEnd) {
      const boxSize = view.getUint32(scanOffset);
      const boxType = String.fromCharCode(
        view.getUint8(scanOffset + 4), view.getUint8(scanOffset + 5),
        view.getUint8(scanOffset + 6), view.getUint8(scanOffset + 7)
      );
      if (boxSize < 8 || scanOffset + boxSize > ipco.contentEnd) break;

      if (boxType === 'colr') {
        const cStart = scanOffset + 8;
        const cEnd = scanOffset + boxSize;
        if (cStart + 4 <= cEnd) {
          const ct = String.fromCharCode(
            view.getUint8(cStart), view.getUint8(cStart + 1),
            view.getUint8(cStart + 2), view.getUint8(cStart + 3)
          );
          if (ct === 'nclx') {
            nclxColr = { contentStart: cStart, contentEnd: cEnd };
          } else if (ct === 'prof' || ct === 'ricc') {
            // ICC profile data starts after the 4-byte colour_type
            iccProfileStart = cStart + 4;
            iccProfileEnd = cEnd;
          }
        }
      }
      scanOffset += boxSize;
    }
  }

  // Try nclx first
  if (nclxColr) {
    const colr = nclxColr;
    if (colr.contentStart + 4 + 4 <= colr.contentEnd) {
      const primariesCode = view.getUint16(colr.contentStart + 4);
      const transferCode = view.getUint16(colr.contentStart + 6);

      let transferFunction: TransferFunction;
      if (transferCode === 16) {
        transferFunction = 'pq';
      } else if (transferCode === 18) {
        transferFunction = 'hlg';
      } else {
        transferFunction = 'srgb';
      }

      const colorPrimaries: ColorPrimaries = primariesCode === 9 ? 'bt2020' : 'bt709';
      const isHDR = transferFunction === 'pq' || transferFunction === 'hlg';

      if (isHDR) {
        return { transferFunction, colorPrimaries, isHDR: true };
      }
    }
  }

  // Fallback: check ICC profile for HDR transfer curves (PQ / HLG).
  // Some encoders signal HDR only via ICC profile, not nclx.
  if (iccProfileStart > 0 && iccProfileEnd > iccProfileStart) {
    const iccResult = detectHDRFromICCProfile(view, iccProfileStart, iccProfileEnd);
    if (iccResult) {
      return iccResult;
    }
  }

  return null;
}

/**
 * Detect HDR from an ICC profile embedded in a colr(prof) box.
 *
 * Checks:
 * 1. Profile description tag ('desc') for PQ/HLG/HDR keywords
 * 2. CICP tag ('cicp', ICC v4.4+) for PQ/HLG transfer characteristics
 * 3. TRC curve tag ('rTRC') — parametric PQ curve detection
 */
function detectHDRFromICCProfile(
  view: DataView,
  start: number,
  end: number
): AVIFColorInfo | null {
  const profileSize = end - start;

  // ICC profile minimum: 128-byte header + 4-byte tag count
  if (profileSize < 132) return null;

  // Read tag count at offset 128
  const tagCount = view.getUint32(start + 128);
  if (tagCount > 100) return null; // sanity

  // Scan tag table (starts at offset 132, each entry is 12 bytes: sig(4) + offset(4) + size(4))
  let descText = '';
  let cicpTransfer = -1;
  let cicpPrimaries = -1;
  let hasPQCurve = false;

  for (let i = 0; i < tagCount; i++) {
    const tagEntry = start + 132 + i * 12;
    if (tagEntry + 12 > end) break;

    const sig = String.fromCharCode(
      view.getUint8(tagEntry), view.getUint8(tagEntry + 1),
      view.getUint8(tagEntry + 2), view.getUint8(tagEntry + 3)
    );
    const tagOffset = view.getUint32(tagEntry + 4);
    const tagSize = view.getUint32(tagEntry + 8);
    const tagDataStart = start + tagOffset;
    const tagDataEnd = Math.min(tagDataStart + tagSize, end);

    if (tagDataStart >= end || tagDataEnd > end) continue;

    // 1. 'desc' tag — profile description
    if (sig === 'desc' && tagSize > 12) {
      descText = readICCDescriptionTag(view, tagDataStart, tagDataEnd);
    }

    // 2. 'cicp' tag (ICC v4.4+) — CICP colour info
    if (sig === 'cicp' && tagSize >= 12) {
      // cicp tag: type signature(4) + reserved(4) + primaries(1) + transfer(1) + matrix(1) + range(1)
      const typeTag = String.fromCharCode(
        view.getUint8(tagDataStart), view.getUint8(tagDataStart + 1),
        view.getUint8(tagDataStart + 2), view.getUint8(tagDataStart + 3)
      );
      if (typeTag === 'cicp') {
        cicpPrimaries = view.getUint8(tagDataStart + 8);
        cicpTransfer = view.getUint8(tagDataStart + 9);
      }
    }

    // 3. 'rTRC' tag — check for parametric PQ curve
    if (sig === 'rTRC' && tagSize >= 12) {
      hasPQCurve = detectPQParametricCurve(view, tagDataStart, tagDataEnd);
    }
  }

  // Check CICP tag first (most reliable)
  if (cicpTransfer === 16) {
    const colorPrimaries: ColorPrimaries = cicpPrimaries === 9 ? 'bt2020' : 'bt709';
    return { transferFunction: 'pq', colorPrimaries, isHDR: true };
  }
  if (cicpTransfer === 18) {
    const colorPrimaries: ColorPrimaries = cicpPrimaries === 9 ? 'bt2020' : 'bt709';
    return { transferFunction: 'hlg', colorPrimaries, isHDR: true };
  }

  // Check profile description for HDR keywords
  const descLower = descText.toLowerCase();
  if (descLower.includes('pq') || descLower.includes('smpte st 2084') || descLower.includes('st2084')) {
    return { transferFunction: 'pq', colorPrimaries: descLower.includes('2020') ? 'bt2020' : 'bt709', isHDR: true };
  }
  if (descLower.includes('hlg') || descLower.includes('std-b67') || descLower.includes('arib')) {
    return { transferFunction: 'hlg', colorPrimaries: descLower.includes('2020') ? 'bt2020' : 'bt709', isHDR: true };
  }
  // Generic HDR keyword match (less precise, default to PQ)
  if (descLower.includes('hdr') || descLower.includes('2100')) {
    return { transferFunction: 'pq', colorPrimaries: descLower.includes('2020') ? 'bt2020' : 'bt709', isHDR: true };
  }

  // Check TRC curve
  if (hasPQCurve) {
    return { transferFunction: 'pq', colorPrimaries: 'bt709', isHDR: true };
  }

  // Wide gamut detection: Display P3 or BT.2020 ICC profiles benefit from
  // the VideoFrame HDR path — preserves color volume and enables EDR output
  // on HDR displays (brighter whites, more saturated colors).
  const isP3 = /\bdisplay\s*p3\b/i.test(descText) || /\bp3\b/i.test(descText);
  const isBT2020 = /\bbt\.?2020\b/i.test(descText) || /\brec\.?2020\b/i.test(descText);
  if (isP3 || isBT2020) {
    const colorPrimaries: ColorPrimaries = isBT2020 ? 'bt2020' : 'bt709';
    return { transferFunction: 'srgb', colorPrimaries, isHDR: true };
  }

  return null;
}

/**
 * Read the text from an ICC 'desc' (profileDescriptionTag) or 'mluc' tag.
 */
function readICCDescriptionTag(view: DataView, start: number, end: number): string {
  if (start + 8 > end) return '';

  const typeSig = String.fromCharCode(
    view.getUint8(start), view.getUint8(start + 1),
    view.getUint8(start + 2), view.getUint8(start + 3)
  );

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
    if (start + 16 > end) return '';
    const recordCount = view.getUint32(start + 8);
    if (recordCount === 0) return '';
    // First record: language(2) + country(2) + length(4) + offset(4) at start+16
    if (start + 28 > end) return '';
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

/**
 * Detect if a TRC tag contains a PQ-like parametric curve.
 * PQ (SMPTE ST 2084) uses a specific EOTF that's characterized by
 * parametric curve type 4 with distinctive coefficients.
 */
function detectPQParametricCurve(view: DataView, start: number, end: number): boolean {
  if (start + 8 > end) return false;

  const typeSig = String.fromCharCode(
    view.getUint8(start), view.getUint8(start + 1),
    view.getUint8(start + 2), view.getUint8(start + 3)
  );

  // 'para' type: parametric curve
  if (typeSig === 'para') {
    if (start + 12 > end) return false;
    const funcType = view.getUint16(start + 8);
    // PQ is typically encoded as funcType 4 (Y = (aX+b)^g + c) with extreme gamma
    // or as a large curv LUT. Check gamma for PQ-like values (gamma > 10 is suspicious).
    if (funcType === 0 && start + 16 <= end) {
      // Simple gamma: s15Fixed16 at offset 12
      const gamma = view.getInt32(start + 12) / 65536.0;
      if (gamma > 10) return true; // PQ effective gamma is very high
    }
    return false;
  }

  // 'curv' type: check if it's a large LUT (PQ profiles often have 4096+ entries)
  if (typeSig === 'curv') {
    if (start + 12 > end) return false;
    const entryCount = view.getUint32(start + 8);
    // PQ TRC LUTs are typically 1024-4096 entries with values that reach well above
    // linear 1.0. Check the last few entries — PQ at max input maps to ~10000 nits.
    if (entryCount >= 1024 && start + 12 + entryCount * 2 <= end) {
      // Read last entry (uint16, max 65535 maps to 1.0 in SDR or higher in HDR)
      // For a standard gamma curve, the last entry is 65535.
      // For PQ, the curve shape is distinctive — check mid-point.
      // SDR gamma: mid-point (~entry 512 of 1024) is ~46340 (sqrt(0.5)*65535)
      // PQ: mid-point is much lower due to the steep curve at high values.
      const midIdx = Math.floor(entryCount / 2);
      const midVal = view.getUint16(start + 12 + midIdx * 2);
      const endVal = view.getUint16(start + 12 + (entryCount - 1) * 2);
      // PQ mid-point is typically very low relative to endpoint
      // (PQ concentrates precision in darks). Ratio < 0.1 is a strong PQ signal.
      if (endVal > 0 && midVal / endVal < 0.15) return true;
    }
    return false;
  }

  return false;
}

/**
 * Parse JXL ISOBMFF container to extract color info from colr(nclx) box.
 *
 * Unlike AVIF (which nests colr inside meta/iprp/ipco), JXL ISOBMFF containers
 * place colr boxes at the top level (ISO 18181-2). We scan all top-level boxes
 * after ftyp for colr(nclx).
 *
 * Returns null if no nclx colour info found (treat as SDR).
 */
function parseJXLColorInfo(buffer: ArrayBuffer): AVIFColorInfo | null {
  const view = new DataView(buffer);
  const length = buffer.byteLength;
  if (length < 12) return null;

  // Skip past ftyp box
  const ftypSize = view.getUint32(0);
  if (ftypSize < 8 || ftypSize > length) return null;

  // Scan top-level boxes after ftyp for colr(nclx)
  let offset = ftypSize;
  while (offset + 8 <= length) {
    const boxSize = view.getUint32(offset);
    if (boxSize < 8 || offset + boxSize > length) break;

    const boxType = String.fromCharCode(
      view.getUint8(offset + 4), view.getUint8(offset + 5),
      view.getUint8(offset + 6), view.getUint8(offset + 7)
    );

    if (boxType === 'colr') {
      const cStart = offset + 8;
      const cEnd = offset + boxSize;
      if (cStart + 4 <= cEnd) {
        const colourType = String.fromCharCode(
          view.getUint8(cStart), view.getUint8(cStart + 1),
          view.getUint8(cStart + 2), view.getUint8(cStart + 3)
        );
        if (colourType === 'nclx' && cStart + 4 + 4 <= cEnd) {
          const primariesCode = view.getUint16(cStart + 4);
          const transferCode = view.getUint16(cStart + 6);

          let transferFunction: TransferFunction;
          if (transferCode === 16) {
            transferFunction = 'pq';
          } else if (transferCode === 18) {
            transferFunction = 'hlg';
          } else {
            transferFunction = 'srgb';
          }

          const colorPrimaries: ColorPrimaries = primariesCode === 9 ? 'bt2020' : 'bt709';
          const isHDR = transferFunction === 'pq' || transferFunction === 'hlg';

          if (isHDR) {
            return { transferFunction, colorPrimaries, isHDR: true };
          }
        }
      }
    }

    offset += boxSize;
  }

  return null;
}

@RegisterNode('RVFileSource')
export class FileSourceNode extends BaseSourceNode {
  private image: HTMLImageElement | null = null;
  private url: string = '';
  private cachedIPImage: IPImage | null = null;
  private isEXR: boolean = false;
  private _isHDRFormat: boolean = false;
  private _formatName: string | null = null;

  // EXR layer support
  private exrBuffer: ArrayBuffer | null = null;
  private exrLayers: EXRLayerInfo[] = [];
  private currentExrLayer: string | null = null;
  private currentExrRemapping: EXRChannelRemapping | null = null;

  // RAW preview EXIF metadata
  private _rawExifMetadata: RAWExifMetadata | null = null;

  // Canvas cache for HDR rendering (avoids creating new canvas on every getCanvas() call)
  private cachedCanvas: HTMLCanvasElement | null = null;
  private canvasDirty: boolean = true;

  constructor(name?: string) {
    super('RVFileSource', name ?? 'File Source');

    // Define properties
    this.properties.add({ name: 'url', defaultValue: '' });
    this.properties.add({ name: 'width', defaultValue: 0 });
    this.properties.add({ name: 'height', defaultValue: 0 });
    this.properties.add({ name: 'originalUrl', defaultValue: '' });
    this.properties.add({ name: 'isHDR', defaultValue: false });
    this.properties.add({ name: 'exrLayer', defaultValue: null });
  }

  /**
   * Get the detected format name for this source
   */
  get formatName(): string | null {
    return this._formatName;
  }

  /**
   * Get the RAW EXIF metadata (only available for RAW preview files)
   */
  get rawExifMetadata(): RAWExifMetadata | null {
    return this._rawExifMetadata;
  }

  /**
   * Load image from URL
   */
  async load(url: string, name?: string, originalUrl?: string): Promise<void> {
    const filename = name ?? url.split('/').pop() ?? 'image';

    // Check if this is an EXR file
    if (isEXRExtension(filename)) {
      await this.loadEXRFromUrl(url, filename, originalUrl);
      return;
    }

    // Check if this is a DPX, Cineon, or Radiance HDR file (always HDR)
    if (isDPXExtension(filename) || isCineonExtension(filename) || isHDRExtension(filename)) {
      await this.loadHDRFromUrl(url, filename, originalUrl);
      return;
    }

    // Check if this is a TIFF file - need to fetch and check if it's float
    if (isTIFFExtension(filename)) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          if (decoderRegistry.detectFormat(buffer) === 'tiff') {
            await this.loadHDRFromBuffer(buffer, filename, url, originalUrl);
            return;
          }
        }
        // Non-float TIFF or fetch failed - fall through to standard image loading
      } catch {
        // Fall through to standard image loading
      }
    }

    // Check if this is a JPEG HDR file with gainmap
    if (isJPEGExtension(filename)) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const { isGainmapJPEG, parseGainmapJPEG } = await import('../../formats/JPEGGainmapDecoder');
          if (isGainmapJPEG(buffer)) {
            const info = parseGainmapJPEG(buffer);
            if (info) {
              await this.loadGainmapJPEG(buffer, info, filename, url, originalUrl);
              return;
            }
          }
          // Not a gainmap JPEG - use blob URL from already-fetched data to avoid re-fetch
          const blob = new Blob([buffer], { type: 'image/jpeg' });
          const blobUrl = URL.createObjectURL(blob);
          return new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              URL.revokeObjectURL(blobUrl);
              this.image = img;
              this.url = url;
              this.isEXR = false;
              this._isHDRFormat = false;
              this._formatName = null;
              this.metadata = {
                name: filename,
                width: img.naturalWidth,
                height: img.naturalHeight,
                duration: 1,
                fps: 24,
              };
              this.properties.setValue('url', url);
              if (originalUrl) {
                this.properties.setValue('originalUrl', originalUrl);
              }
              this.properties.setValue('width', img.naturalWidth);
              this.properties.setValue('height', img.naturalHeight);
              this.properties.setValue('isHDR', false);
              this.markDirty();
              this.cachedIPImage = null;
              resolve();
            };
            img.onerror = () => {
              URL.revokeObjectURL(blobUrl);
              reject(new Error(`Failed to load image: ${url}`));
            };
            img.src = blobUrl;
          });
        }
        // Fetch failed - fall through to standard image loading
      } catch (err) {
        console.warn('[FileSource] JPEG gainmap loading failed, falling back to standard loading:', err);
        // Fall through to standard image loading
      }
    }

    // Check if this is an AVIF file - detect HDR via gainmap or ISOBMFF colr box
    if (isAVIFExtension(filename)) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const avifValid = isAVIFFile(buffer);
          if (avifValid) {
            // Check for gainmap FIRST (gainmap AVIF may also have nclx HDR markers)
            const { isGainmapAVIF, parseGainmapAVIF } = await import('../../formats/AVIFGainmapDecoder');
            const hasGainmap = isGainmapAVIF(buffer);
            if (hasGainmap) {
              const gmInfo = parseGainmapAVIF(buffer);
              if (gmInfo) {
                await this.loadGainmapAVIF(buffer, gmInfo, filename, url, originalUrl);
                return;
              }
            }
            // Check nclx colr for HLG/PQ HDR
            const colorInfo = parseAVIFColorInfo(buffer);
            if (colorInfo?.isHDR) {
              await this.loadAVIFHDR(buffer, colorInfo, filename, url, originalUrl);
              return;
            }
          }
          // Not HDR AVIF - use blob URL from already-fetched data to avoid re-fetch
          const blob = new Blob([buffer], { type: 'image/avif' });
          const blobUrl = URL.createObjectURL(blob);
          return new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              URL.revokeObjectURL(blobUrl);
              this.image = img;
              this.url = url;
              this.isEXR = false;
              this._isHDRFormat = false;
              this._formatName = null;
              this.metadata = {
                name: filename,
                width: img.naturalWidth,
                height: img.naturalHeight,
                duration: 1,
                fps: 24,
              };
              this.properties.setValue('url', url);
              if (originalUrl) {
                this.properties.setValue('originalUrl', originalUrl);
              }
              this.properties.setValue('width', img.naturalWidth);
              this.properties.setValue('height', img.naturalHeight);
              this.properties.setValue('isHDR', false);
              this.markDirty();
              this.cachedIPImage = null;
              resolve();
            };
            img.onerror = () => {
              URL.revokeObjectURL(blobUrl);
              reject(new Error(`Failed to load image: ${url}`));
            };
            img.src = blobUrl;
          });
        }
      } catch (err) {
        console.warn('[FileSource] AVIF loading failed, falling back to standard loading:', err);
        // Fall through to standard image loading
      }
    }

    // Check if this is a JXL file - detect HDR via ISOBMFF colr box, SDR via WASM decode
    if (isJXLExtension(filename)) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const { isJXLFile, isJXLContainer } = await import('../../formats/JXLDecoder');
          if (isJXLFile(buffer)) {
            // Check ISOBMFF container for HDR color info (same nclx parsing as AVIF)
            if (isJXLContainer(buffer)) {
              const colorInfo = parseJXLColorInfo(buffer);
              if (colorInfo?.isHDR) {
                await this.loadJXLHDR(buffer, colorInfo, filename, url, originalUrl);
                return;
              }
            }
            // SDR path: try browser-native decode first (faster), fall back to WASM
            try {
              const loaded = await this.tryLoadJXLNative(buffer, filename, url, originalUrl);
              if (loaded) return;
            } catch {
              // Browser doesn't support JXL natively — fall through to WASM
            }
            await this.loadJXLFromBuffer(buffer, filename, url, originalUrl);
            return;
          }
        }
      } catch (err) {
        console.warn('[FileSource] JXL loading failed, falling back to standard loading:', err);
        // Fall through to standard image loading
      }
    }

    // Check if this is a HEIC file - detect HDR via gainmap or colr(nclx)
    if (isHEICExtension(filename)) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const { isHEICFile, isGainmapHEIC, parseHEICGainmapInfo, parseHEICColorInfo } = await import('../../formats/HEICGainmapDecoder');
          if (isHEICFile(buffer)) {
            // Check for gainmap FIRST (gainmap HEIC may also have nclx HDR markers)
            if (isGainmapHEIC(buffer)) {
              const gmInfo = parseHEICGainmapInfo(buffer);
              if (gmInfo) {
                await this.loadGainmapHEIC(buffer, gmInfo, filename, url, originalUrl);
                return;
              }
            }
            // Check nclx colr for HLG/PQ HDR (Safari only - VideoFrame path)
            const colorInfo = parseHEICColorInfo(buffer);
            if (colorInfo?.isHDR) {
              await this.loadHEICHDR(buffer, colorInfo, filename, url, originalUrl);
              return;
            }
            // SDR fallback: try native first (Safari), then WASM
            try {
              const loaded = await this.tryLoadHEICNative(buffer, filename, url, originalUrl);
              if (loaded) return;
            } catch {
              // Native decode failed
            }
            await this.loadHEICSDRWasm(buffer, filename, url, originalUrl);
            return;
          }
        }
      } catch (err) {
        console.warn('[FileSource] HEIC loading failed, falling back to standard loading:', err);
        // Fall through to standard image loading
      }
    }

    // Check if this is a JP2/J2K/JHC file - decode via WASM
    if (isJP2Extension(filename)) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          await this.loadHDRFromBuffer(buffer, filename, url, originalUrl);
          return;
        }
      } catch (err) {
        console.warn('[FileSource] JP2 loading failed, falling back to standard loading:', err);
        // Fall through to standard image loading
      }
    }

    // Check if this is a RAW file - extract embedded JPEG preview
    if (isRAWExtension(filename)) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const { extractRAWPreview } = await import('../../formats/RAWPreviewDecoder');
          const loaded = await this.loadRAWPreview(extractRAWPreview, buffer, filename, url, originalUrl);
          if (loaded) return;
        }
      } catch (err) {
        console.warn('[FileSource] RAW preview loading failed, falling back to standard loading:', err);
        // Fall through to standard image loading
      }
    }

    // Standard image loading via HTMLImageElement
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        this.image = img;
        this.url = url;
        this.isEXR = false;
        this._isHDRFormat = false;
        this._formatName = null;
        this.metadata = {
          name: filename,
          width: img.naturalWidth,
          height: img.naturalHeight,
          duration: 1,
          fps: 24,
        };

        this.properties.setValue('url', url);
        // store original url if provided (for file system path preservation)
        if (originalUrl) {
          this.properties.setValue('originalUrl', originalUrl);
        }
        this.properties.setValue('width', img.naturalWidth);
        this.properties.setValue('height', img.naturalHeight);
        this.properties.setValue('isHDR', false);

        this.markDirty();
        this.cachedIPImage = null;
        resolve();
      };

      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }

  /**
   * Load EXR file from URL
   */
  private async loadEXRFromUrl(url: string, name: string, originalUrl?: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch EXR file: ${url}`);
    }

    const buffer = await response.arrayBuffer();
    await this.loadEXRFromBuffer(buffer, name, url, originalUrl);
  }

  /**
   * Load HDR format file (DPX, Cineon, Float TIFF, Radiance HDR) from URL
   */
  private async loadHDRFromUrl(url: string, name: string, originalUrl?: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch HDR file: ${url}`);
    }

    const buffer = await response.arrayBuffer();
    await this.loadHDRFromBuffer(buffer, name, url, originalUrl);
  }

  /**
   * Get the width of the loaded image
   */
  get width(): number {
    return this.metadata.width;
  }

  /**
   * Get the height of the loaded image
   */
  get height(): number {
    return this.metadata.height;
  }

  /**
   * Load EXR file from ArrayBuffer (public wrapper)
   */
  async loadFromEXR(
    buffer: ArrayBuffer,
    name: string,
    url: string,
    originalUrl?: string,
    options?: EXRDecodeOptions
  ): Promise<void> {
    return this.loadEXRFromBuffer(buffer, name, url, originalUrl, options);
  }

  /**
   * Load EXR file from ArrayBuffer
   */
  private async loadEXRFromBuffer(
    buffer: ArrayBuffer,
    name: string,
    url: string,
    originalUrl?: string,
    options?: EXRDecodeOptions
  ): Promise<void> {
    const { isEXRFile, decodeEXR, exrToIPImage } = await import('../../formats/EXRDecoder');

    // Verify it's actually an EXR file
    if (!isEXRFile(buffer)) {
      throw new Error('Invalid EXR file: wrong magic number');
    }

    // Store the buffer for potential re-decoding with different layers
    this.exrBuffer = buffer;

    // Decode EXR with optional layer selection
    const result = await decodeEXR(buffer, options);

    // Store layer information
    this.exrLayers = result.layers ?? [];
    this.currentExrLayer = options?.layer ?? null;
    this.currentExrRemapping = options?.channelRemapping ?? null;

    // Convert to IPImage
    this.cachedIPImage = exrToIPImage(result, originalUrl ?? url);
    this.cachedIPImage.metadata.frameNumber = 1;

    this.url = url;
    this.isEXR = true;
    this._isHDRFormat = true;
    this._formatName = 'exr';
    this.image = null; // No HTMLImageElement for EXR

    this.metadata = {
      name,
      width: result.width,
      height: result.height,
      duration: 1,
      fps: 24,
    };

    this.properties.setValue('url', url);
    if (originalUrl) {
      this.properties.setValue('originalUrl', originalUrl);
    }
    this.properties.setValue('width', result.width);
    this.properties.setValue('height', result.height);
    this.properties.setValue('isHDR', true);
    this.properties.setValue('exrLayer', options?.layer ?? null);

    // Mark canvas as dirty so it gets re-rendered on next getCanvas() call
    this.canvasDirty = true;
    this.markDirty();
  }

  /**
   * Load HDR format file (DPX, Cineon, Float TIFF, Radiance HDR) from ArrayBuffer
   */
  private async loadHDRFromBuffer(
    buffer: ArrayBuffer,
    name: string,
    url: string,
    originalUrl?: string
  ): Promise<void> {
    // Detect format and decode via registry
    const result = await decoderRegistry.detectAndDecode(buffer, { applyLogToLinear: true });
    if (!result) {
      throw new Error('Unsupported HDR format or invalid file');
    }
    const { formatName, ...decodeResult } = result;

    // Convert decode result to IPImage
    const metadata: ImageMetadata = {
      colorSpace: decodeResult.colorSpace,
      sourcePath: originalUrl ?? url,
      attributes: {
        ...(decodeResult.metadata as Record<string, unknown>),
        formatName,
      },
    };

    this.cachedIPImage = new IPImage({
      width: decodeResult.width,
      height: decodeResult.height,
      channels: decodeResult.channels,
      dataType: 'float32',
      data: decodeResult.data.buffer as ArrayBuffer,
      metadata,
    });
    this.cachedIPImage.metadata.frameNumber = 1;

    this.url = url;
    this.isEXR = false;
    this._isHDRFormat = true;
    this._formatName = formatName;
    this.image = null;

    this.metadata = {
      name,
      width: decodeResult.width,
      height: decodeResult.height,
      duration: 1,
      fps: 24,
    };

    this.properties.setValue('url', url);
    if (originalUrl) {
      this.properties.setValue('originalUrl', originalUrl);
    }
    this.properties.setValue('width', decodeResult.width);
    this.properties.setValue('height', decodeResult.height);
    this.properties.setValue('isHDR', true);

    // Mark canvas as dirty so it gets re-rendered on next getCanvas() call
    this.canvasDirty = true;
    this.markDirty();
  }

  /**
   * Load JPEG HDR file with gainmap
   */
  private async loadGainmapJPEG(
    buffer: ArrayBuffer,
    info: import('../../formats/JPEGGainmapDecoder').GainmapInfo,
    name: string,
    url: string,
    originalUrl?: string
  ): Promise<void> {
    const { decodeGainmapToFloat32 } = await import('../../formats/JPEGGainmapDecoder');
    const result = await decodeGainmapToFloat32(buffer, info);
    // Compute peak pixel value for metadata
    let peakValue = 0;
    for (let i = 0; i < Math.min(result.data.length, 500000); i++) {
      if (result.data[i]! > peakValue) peakValue = result.data[i]!;
    }

    const metadata: ImageMetadata = {
      colorSpace: 'linear',
      sourcePath: originalUrl ?? url,
      transferFunction: 'srgb',
      colorPrimaries: 'bt709',
      attributes: {
        formatName: 'jpeg-gainmap',
        headroom: info.headroom,
        peakValue,
      },
    };

    this.cachedIPImage = new IPImage({
      width: result.width,
      height: result.height,
      channels: result.channels,
      dataType: 'float32',
      data: result.data.buffer as ArrayBuffer,
      metadata,
    });
    this.cachedIPImage.metadata.frameNumber = 1;

    this.url = url;
    this.isEXR = false;
    this._isHDRFormat = true;
    this._formatName = 'jpeg-gainmap';
    this.image = null;

    this.metadata = {
      name,
      width: result.width,
      height: result.height,
      duration: 1,
      fps: 24,
    };

    this.properties.setValue('url', url);
    if (originalUrl) {
      this.properties.setValue('originalUrl', originalUrl);
    }
    this.properties.setValue('width', result.width);
    this.properties.setValue('height', result.height);
    this.properties.setValue('isHDR', true);

    this.canvasDirty = true;
    this.markDirty();
  }

  /**
   * Load AVIF HDR file with gainmap
   */
  private async loadGainmapAVIF(
    buffer: ArrayBuffer,
    info: import('../../formats/AVIFGainmapDecoder').AVIFGainmapInfo,
    name: string,
    url: string,
    originalUrl?: string
  ): Promise<void> {
    const { decodeAVIFGainmapToFloat32 } = await import('../../formats/AVIFGainmapDecoder');
    const result = await decodeAVIFGainmapToFloat32(buffer, info);

    // Compute peak pixel value for metadata
    let peakValue = 0;
    for (let i = 0; i < Math.min(result.data.length, 500000); i++) {
      if (result.data[i]! > peakValue) peakValue = result.data[i]!;
    }

    const metadata: ImageMetadata = {
      colorSpace: 'linear',
      sourcePath: originalUrl ?? url,
      transferFunction: 'srgb',
      colorPrimaries: 'bt709',
      attributes: {
        formatName: 'avif-gainmap',
        headroom: info.headroom,
        peakValue,
      },
    };

    this.cachedIPImage = new IPImage({
      width: result.width,
      height: result.height,
      channels: result.channels,
      dataType: 'float32',
      data: result.data.buffer as ArrayBuffer,
      metadata,
    });
    this.cachedIPImage.metadata.frameNumber = 1;

    this.url = url;
    this.isEXR = false;
    this._isHDRFormat = true;
    this._formatName = 'avif-gainmap';
    this.image = null;

    this.metadata = {
      name,
      width: result.width,
      height: result.height,
      duration: 1,
      fps: 24,
    };

    this.properties.setValue('url', url);
    if (originalUrl) {
      this.properties.setValue('originalUrl', originalUrl);
    }
    this.properties.setValue('width', result.width);
    this.properties.setValue('height', result.height);
    this.properties.setValue('isHDR', true);

    this.canvasDirty = true;
    this.markDirty();
  }

  /**
   * Load HDR AVIF file using VideoFrame for GPU upload (preserves HDR values)
   */
  private async loadAVIFHDR(
    buffer: ArrayBuffer,
    colorInfo: AVIFColorInfo,
    name: string,
    url: string,
    originalUrl?: string
  ): Promise<void> {
    const blob = new Blob([buffer], { type: 'image/avif' });
    const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
    const videoFrame = new VideoFrame(bitmap, { timestamp: 0 });
    bitmap.close();

    const metadata: ImageMetadata = {
      sourcePath: originalUrl ?? url,
      frameNumber: 1,
      transferFunction: colorInfo.transferFunction,
      colorPrimaries: colorInfo.colorPrimaries,
      colorSpace: colorInfo.colorPrimaries === 'bt2020' ? 'rec2020' : 'rec709',
      attributes: {
        hdr: true,
        formatName: 'avif-hdr',
      },
    };

    this.cachedIPImage = new IPImage({
      width: videoFrame.displayWidth,
      height: videoFrame.displayHeight,
      channels: 4,
      dataType: 'float32',
      data: new ArrayBuffer(4), // minimal placeholder; VideoFrame is the pixel source
      videoFrame,
      metadata,
    });

    this.url = url;
    this.isEXR = false;
    this._isHDRFormat = true;
    this._formatName = 'avif-hdr';
    this.image = null;

    this.metadata = {
      name,
      width: videoFrame.displayWidth,
      height: videoFrame.displayHeight,
      duration: 1,
      fps: 24,
    };

    this.properties.setValue('url', url);
    if (originalUrl) {
      this.properties.setValue('originalUrl', originalUrl);
    }
    this.properties.setValue('width', videoFrame.displayWidth);
    this.properties.setValue('height', videoFrame.displayHeight);
    this.properties.setValue('isHDR', true);

    this.canvasDirty = true;
    this.markDirty();
  }

  /**
   * Load HDR JXL file using VideoFrame for GPU upload (preserves HDR values).
   * Mirrors loadAVIFHDR — uses createImageBitmap → VideoFrame path.
   */
  private async loadJXLHDR(
    buffer: ArrayBuffer,
    colorInfo: AVIFColorInfo,
    name: string,
    url: string,
    originalUrl?: string
  ): Promise<void> {
    const blob = new Blob([buffer], { type: 'image/jxl' });
    const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
    const videoFrame = new VideoFrame(bitmap, { timestamp: 0 });
    bitmap.close();

    const metadata: ImageMetadata = {
      sourcePath: originalUrl ?? url,
      frameNumber: 1,
      transferFunction: colorInfo.transferFunction,
      colorPrimaries: colorInfo.colorPrimaries,
      colorSpace: colorInfo.colorPrimaries === 'bt2020' ? 'rec2020' : 'rec709',
      attributes: {
        hdr: true,
        formatName: 'jxl-hdr',
      },
    };

    this.cachedIPImage = new IPImage({
      width: videoFrame.displayWidth,
      height: videoFrame.displayHeight,
      channels: 4,
      dataType: 'float32',
      data: new ArrayBuffer(4), // minimal placeholder; VideoFrame is the pixel source
      videoFrame,
      metadata,
    });

    this.url = url;
    this.isEXR = false;
    this._isHDRFormat = true;
    this._formatName = 'jxl-hdr';
    this.image = null;

    this.metadata = {
      name,
      width: videoFrame.displayWidth,
      height: videoFrame.displayHeight,
      duration: 1,
      fps: 24,
    };

    this.properties.setValue('url', url);
    if (originalUrl) {
      this.properties.setValue('originalUrl', originalUrl);
    }
    this.properties.setValue('width', videoFrame.displayWidth);
    this.properties.setValue('height', videoFrame.displayHeight);
    this.properties.setValue('isHDR', true);

    this.canvasDirty = true;
    this.markDirty();
  }

  /**
   * Load HEIC HDR file with gainmap
   */
  private async loadGainmapHEIC(
    buffer: ArrayBuffer,
    info: HEICGainmapInfo,
    name: string,
    url: string,
    originalUrl?: string
  ): Promise<void> {
    const { decodeHEICGainmapToFloat32 } = await import('../../formats/HEICGainmapDecoder');
    const result = await decodeHEICGainmapToFloat32(buffer, info);

    // Compute peak pixel value for metadata
    let peakValue = 0;
    for (let i = 0; i < Math.min(result.data.length, 500000); i++) {
      if (result.data[i]! > peakValue) peakValue = result.data[i]!;
    }

    const metadata: ImageMetadata = {
      colorSpace: 'linear',
      sourcePath: originalUrl ?? url,
      transferFunction: 'srgb',
      colorPrimaries: 'bt709',
      attributes: {
        formatName: 'heic-gainmap',
        headroom: info.headroom,
        peakValue,
      },
    };

    this.cachedIPImage = new IPImage({
      width: result.width,
      height: result.height,
      channels: result.channels,
      dataType: 'float32',
      data: result.data.buffer as ArrayBuffer,
      metadata,
    });
    this.cachedIPImage.metadata.frameNumber = 1;

    this.url = url;
    this.isEXR = false;
    this._isHDRFormat = true;
    this._formatName = 'heic-gainmap';
    this.image = null;

    this.metadata = {
      name,
      width: result.width,
      height: result.height,
      duration: 1,
      fps: 24,
    };

    this.properties.setValue('url', url);
    if (originalUrl) {
      this.properties.setValue('originalUrl', originalUrl);
    }
    this.properties.setValue('width', result.width);
    this.properties.setValue('height', result.height);
    this.properties.setValue('isHDR', true);

    this.canvasDirty = true;
    this.markDirty();
  }

  /**
   * Load HDR HEIC file using VideoFrame for GPU upload (preserves HDR values).
   * Only works on Safari (which supports native HEVC decode).
   */
  private async loadHEICHDR(
    buffer: ArrayBuffer,
    colorInfo: HEICColorInfo,
    name: string,
    url: string,
    originalUrl?: string
  ): Promise<void> {
    const blob = new Blob([buffer], { type: 'image/heic' });
    const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
    const videoFrame = new VideoFrame(bitmap, { timestamp: 0 });
    bitmap.close();

    const metadata: ImageMetadata = {
      sourcePath: originalUrl ?? url,
      frameNumber: 1,
      transferFunction: colorInfo.transferFunction,
      colorPrimaries: colorInfo.colorPrimaries,
      colorSpace: colorInfo.colorPrimaries === 'bt2020' ? 'rec2020' : 'rec709',
      attributes: {
        hdr: true,
        formatName: 'heic-hdr',
      },
    };

    this.cachedIPImage = new IPImage({
      width: videoFrame.displayWidth,
      height: videoFrame.displayHeight,
      channels: 4,
      dataType: 'float32',
      data: new ArrayBuffer(4), // minimal placeholder; VideoFrame is the pixel source
      videoFrame,
      metadata,
    });

    this.url = url;
    this.isEXR = false;
    this._isHDRFormat = true;
    this._formatName = 'heic-hdr';
    this.image = null;

    this.metadata = {
      name,
      width: videoFrame.displayWidth,
      height: videoFrame.displayHeight,
      duration: 1,
      fps: 24,
    };

    this.properties.setValue('url', url);
    if (originalUrl) {
      this.properties.setValue('originalUrl', originalUrl);
    }
    this.properties.setValue('width', videoFrame.displayWidth);
    this.properties.setValue('height', videoFrame.displayHeight);
    this.properties.setValue('isHDR', true);

    this.canvasDirty = true;
    this.markDirty();
  }

  /**
   * Load SDR JXL file from ArrayBuffer via @jsquash/jxl WASM decoder.
   */
  private async loadJXLFromBuffer(
    buffer: ArrayBuffer,
    name: string,
    url: string,
    originalUrl?: string
  ): Promise<void> {
    const { decodeJXL } = await import('../../formats/JXLDecoder');
    const result = await decodeJXL(buffer);

    this.cachedIPImage = new IPImage({
      width: result.width,
      height: result.height,
      channels: result.channels,
      dataType: 'float32',
      data: result.data.buffer as ArrayBuffer,
      metadata: {
        sourcePath: originalUrl ?? url,
        frameNumber: 1,
        attributes: {
          formatName: 'jxl',
        },
      },
    });

    this.url = url;
    this.isEXR = false;
    this._isHDRFormat = false;
    this._formatName = 'jxl';
    this.image = null;

    this.metadata = {
      name,
      width: result.width,
      height: result.height,
      duration: 1,
      fps: 24,
    };

    this.properties.setValue('url', url);
    if (originalUrl) {
      this.properties.setValue('originalUrl', originalUrl);
    }
    this.properties.setValue('width', result.width);
    this.properties.setValue('height', result.height);
    this.properties.setValue('isHDR', false);

    this.canvasDirty = true;
    this.markDirty();
  }

  /**
   * Try to load JXL as a standard SDR image using the browser's native decoder.
   * Returns true if the browser supports JXL natively and the image loaded.
   * Returns false if the browser can't decode JXL (caller should fall back to WASM).
   */
  private tryLoadJXLNative(
    buffer: ArrayBuffer,
    name: string,
    url: string,
    originalUrl?: string
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const blob = new Blob([buffer], { type: 'image/jxl' });
      const blobUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        this.image = img;
        this.url = url;
        this.isEXR = false;
        this._isHDRFormat = false;
        this._formatName = 'jxl';
        this.metadata = {
          name,
          width: img.naturalWidth,
          height: img.naturalHeight,
          duration: 1,
          fps: 24,
        };
        this.properties.setValue('url', url);
        if (originalUrl) {
          this.properties.setValue('originalUrl', originalUrl);
        }
        this.properties.setValue('width', img.naturalWidth);
        this.properties.setValue('height', img.naturalHeight);
        this.properties.setValue('isHDR', false);
        this.markDirty();
        this.cachedIPImage = null;
        resolve(true);
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        resolve(false); // Browser doesn't support JXL natively
      };
      img.src = blobUrl;
    });
  }

  /**
   * Try to load HEIC as a standard SDR image using the browser's native decoder.
   * Returns true if the browser supports HEIC natively (Safari) and the image loaded.
   * Returns false if the browser can't decode HEIC (caller should fall back to WASM).
   */
  private tryLoadHEICNative(
    buffer: ArrayBuffer,
    name: string,
    url: string,
    originalUrl?: string
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const blob = new Blob([buffer], { type: 'image/heic' });
      const blobUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        this.image = img;
        this.url = url;
        this.isEXR = false;
        this._isHDRFormat = false;
        this._formatName = 'heic';
        this.metadata = {
          name,
          width: img.naturalWidth,
          height: img.naturalHeight,
          duration: 1,
          fps: 24,
        };
        this.properties.setValue('url', url);
        if (originalUrl) {
          this.properties.setValue('originalUrl', originalUrl);
        }
        this.properties.setValue('width', img.naturalWidth);
        this.properties.setValue('height', img.naturalHeight);
        this.properties.setValue('isHDR', false);
        this.markDirty();
        this.cachedIPImage = null;
        resolve(true);
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        resolve(false); // Browser doesn't support HEIC natively
      };
      img.src = blobUrl;
    });
  }

  /**
   * Load RAW preview by extracting the largest embedded JPEG from the RAW file.
   * Follows the tryLoadJXLNative pattern: blob → objectURL → Image element.
   * Returns true if preview was loaded, false otherwise.
   */
  private loadRAWPreview(
    extractRAWPreviewFn: (buffer: ArrayBuffer) => import('../../formats/RAWPreviewDecoder').RAWPreviewResult | null,
    buffer: ArrayBuffer,
    name: string,
    url: string,
    originalUrl?: string
  ): Promise<boolean> {
    const preview = extractRAWPreviewFn(buffer);
    if (!preview) return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
      const blobUrl = URL.createObjectURL(preview.jpegBlob);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        this.image = img;
        this.url = url;
        this.isEXR = false;
        this._isHDRFormat = false;
        this._formatName = 'raw-preview';
        this._rawExifMetadata = preview.exif;
        this.metadata = {
          name,
          width: img.naturalWidth,
          height: img.naturalHeight,
          duration: 1,
          fps: 24,
        };
        this.properties.setValue('url', url);
        if (originalUrl) {
          this.properties.setValue('originalUrl', originalUrl);
        }
        this.properties.setValue('width', img.naturalWidth);
        this.properties.setValue('height', img.naturalHeight);
        this.properties.setValue('isHDR', false);
        this.markDirty();
        this.cachedIPImage = null;
        resolve(true);
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        resolve(false);
      };
      img.src = blobUrl;
    });
  }

  /**
   * Load SDR HEIC file from ArrayBuffer via libheif-js WASM decoder.
   * Used as fallback on Chrome/Firefox/Edge which lack native HEIC support.
   */
  private async loadHEICSDRWasm(
    buffer: ArrayBuffer,
    name: string,
    url: string,
    originalUrl?: string
  ): Promise<void> {
    const { decodeHEICToImageData } = await import('../../formats/HEICWasmDecoder');
    const result = await decodeHEICToImageData(buffer);

    // Convert Uint8ClampedArray RGBA to Float32Array RGBA (0-255 → 0.0-1.0)
    const totalPixels = result.width * result.height;
    const float32 = new Float32Array(totalPixels * 4);
    const scale = 1.0 / 255.0;
    for (let i = 0; i < totalPixels * 4; i++) {
      float32[i] = (result.data[i] ?? 0) * scale;
    }

    this.cachedIPImage = new IPImage({
      width: result.width,
      height: result.height,
      channels: 4,
      dataType: 'float32',
      data: float32.buffer as ArrayBuffer,
      metadata: {
        sourcePath: originalUrl ?? url,
        frameNumber: 1,
        attributes: {
          formatName: 'heic',
        },
      },
    });

    this.url = url;
    this.isEXR = false;
    this._isHDRFormat = false;
    this._formatName = 'heic';
    this.image = null;

    this.metadata = {
      name,
      width: result.width,
      height: result.height,
      duration: 1,
      fps: 24,
    };

    this.properties.setValue('url', url);
    if (originalUrl) {
      this.properties.setValue('originalUrl', originalUrl);
    }
    this.properties.setValue('width', result.width);
    this.properties.setValue('height', result.height);
    this.properties.setValue('isHDR', false);

    this.canvasDirty = true;
    this.markDirty();
  }

  /**
   * Get available EXR layers (only valid for EXR files)
   */
  getEXRLayers(): EXRLayerInfo[] {
    return this.exrLayers;
  }

  /**
   * Get the currently selected EXR layer
   */
  getCurrentEXRLayer(): string | null {
    return this.currentExrLayer;
  }

  /**
   * Set the EXR layer to display (reloads the EXR with the new layer)
   * Returns true if the layer was changed, false if already selected or not an EXR
   */
  async setEXRLayer(layerName: string | null, remapping?: EXRChannelRemapping): Promise<boolean> {
    if (!this.isEXR || !this.exrBuffer) {
      return false;
    }

    // Check if we're actually changing anything
    const sameLayer = this.currentExrLayer === layerName;
    const sameRemapping = JSON.stringify(this.currentExrRemapping) === JSON.stringify(remapping ?? null);
    if (sameLayer && sameRemapping) {
      return false;
    }

    // Re-decode with the new layer/remapping
    const options: EXRDecodeOptions = {};
    if (layerName && layerName !== 'RGBA') {
      options.layer = layerName;
    }
    if (remapping) {
      options.channelRemapping = remapping;
    }

    await this.loadEXRFromBuffer(
      this.exrBuffer,
      this.metadata.name,
      this.url,
      this.properties.getValue<string>('originalUrl') || undefined,
      Object.keys(options).length > 0 ? options : undefined
    );

    return true;
  }

  /**
   * Load from File object
   */
  async loadFile(file: File): Promise<void> {
    // Check if this is an EXR file
    if (isEXRExtension(file.name)) {
      const buffer = await file.arrayBuffer();
      const url = URL.createObjectURL(file);
      await this.loadEXRFromBuffer(buffer, file.name, url);
      return;
    }

    // Check if this is a DPX, Cineon, or Radiance HDR file (always HDR)
    if (isDPXExtension(file.name) || isCineonExtension(file.name) || isHDRExtension(file.name)) {
      const buffer = await file.arrayBuffer();
      const url = URL.createObjectURL(file);
      await this.loadHDRFromBuffer(buffer, file.name, url);
      return;
    }

    // Check if this is a TIFF file - only use HDR path for float TIFFs
    if (isTIFFExtension(file.name)) {
      const buffer = await file.arrayBuffer();
      if (decoderRegistry.detectFormat(buffer) === 'tiff') {
        const url = URL.createObjectURL(file);
        await this.loadHDRFromBuffer(buffer, file.name, url);
        return;
      }
      // Non-float TIFF - fall through to standard image loading (no URL leak)
    }

    // Check if this is a JPEG HDR file with gainmap
    if (isJPEGExtension(file.name)) {
      try {
        const buffer = await file.arrayBuffer();
        const { isGainmapJPEG, parseGainmapJPEG } = await import('../../formats/JPEGGainmapDecoder');
        if (isGainmapJPEG(buffer)) {
          const info = parseGainmapJPEG(buffer);
          if (info) {
            const url = URL.createObjectURL(file);
            await this.loadGainmapJPEG(buffer, info, file.name, url);
            return;
          }
        }
      } catch (err) {
        console.warn('[FileSource] JPEG gainmap decode failed, falling back to standard loading:', err);
        // Fall through to standard JPEG loading
      }
    }

    // Check if this is an AVIF file - detect HDR via gainmap or ISOBMFF colr box
    if (isAVIFExtension(file.name)) {
      try {
        const buffer = await file.arrayBuffer();
        const avifValid = isAVIFFile(buffer);
        if (avifValid) {
          // Check for gainmap FIRST (gainmap AVIF may also have nclx HDR markers)
          const { isGainmapAVIF, parseGainmapAVIF } = await import('../../formats/AVIFGainmapDecoder');
          const hasGainmap = isGainmapAVIF(buffer);
          if (hasGainmap) {
            const gmInfo = parseGainmapAVIF(buffer);
            if (gmInfo) {
              const url = URL.createObjectURL(file);
              await this.loadGainmapAVIF(buffer, gmInfo, file.name, url);
              return;
            }
          }
          // Check nclx colr for HLG/PQ HDR
          const colorInfo = parseAVIFColorInfo(buffer);
          if (colorInfo?.isHDR) {
            const url = URL.createObjectURL(file);
            await this.loadAVIFHDR(buffer, colorInfo, file.name, url);
            return;
          }
        }
      } catch (err) {
        console.warn('[FileSource] AVIF HDR loading failed, falling back to standard loading:', err);
        // Fall through to standard image loading
      }
    }

    // Check if this is a JXL file - detect HDR via ISOBMFF colr box, SDR via WASM decode
    if (isJXLExtension(file.name)) {
      let jxlBlobUrl: string | null = null;
      try {
        const buffer = await file.arrayBuffer();
        const { isJXLFile, isJXLContainer } = await import('../../formats/JXLDecoder');
        if (isJXLFile(buffer)) {
          // Check ISOBMFF container for HDR color info
          if (isJXLContainer(buffer)) {
            const colorInfo = parseJXLColorInfo(buffer);
            if (colorInfo?.isHDR) {
              jxlBlobUrl = URL.createObjectURL(file);
              await this.loadJXLHDR(buffer, colorInfo, file.name, jxlBlobUrl);
              return;
            }
          }
          // SDR path: try browser-native decode first (faster), fall back to WASM
          jxlBlobUrl = URL.createObjectURL(file);
          try {
            const loaded = await this.tryLoadJXLNative(buffer, file.name, jxlBlobUrl);
            if (loaded) return;
          } catch {
            // Browser doesn't support JXL natively — fall through to WASM
          }
          await this.loadJXLFromBuffer(buffer, file.name, jxlBlobUrl);
          return;
        }
      } catch (err) {
        if (jxlBlobUrl) URL.revokeObjectURL(jxlBlobUrl);
        console.warn('[FileSource] JXL loading failed, falling back to standard loading:', err);
        // Fall through to standard image loading
      }
    }

    // Check if this is a HEIC file - detect HDR via gainmap or colr(nclx)
    if (isHEICExtension(file.name)) {
      try {
        const buffer = await file.arrayBuffer();
        const { isHEICFile, isGainmapHEIC, parseHEICGainmapInfo, parseHEICColorInfo } = await import('../../formats/HEICGainmapDecoder');
        if (isHEICFile(buffer)) {
          // Check for gainmap FIRST
          if (isGainmapHEIC(buffer)) {
            const gmInfo = parseHEICGainmapInfo(buffer);
            if (gmInfo) {
              const url = URL.createObjectURL(file);
              await this.loadGainmapHEIC(buffer, gmInfo, file.name, url);
              return;
            }
          }
          // Check nclx colr for HLG/PQ HDR
          const colorInfo = parseHEICColorInfo(buffer);
          if (colorInfo?.isHDR) {
            const url = URL.createObjectURL(file);
            await this.loadHEICHDR(buffer, colorInfo, file.name, url);
            return;
          }
          // SDR: try native blob URL first (Safari), then WASM fallback
          const heicBlobUrl = URL.createObjectURL(file);
          try {
            const loaded = await this.tryLoadHEICNative(buffer, file.name, heicBlobUrl);
            if (loaded) return;
          } catch {
            // Native decode failed — fall through to WASM
          }
          try {
            await this.loadHEICSDRWasm(buffer, file.name, heicBlobUrl);
          } catch (err) {
            URL.revokeObjectURL(heicBlobUrl);
            throw err;
          }
          return;
        }
      } catch (err) {
        console.warn('[FileSource] HEIC loading failed, falling back to standard loading:', err);
        // Fall through to standard image loading
      }
    }

    // Check if this is a JP2/J2K/JHC file - decode via WASM
    if (isJP2Extension(file.name)) {
      let jp2BlobUrl: string | null = null;
      try {
        const buffer = await file.arrayBuffer();
        jp2BlobUrl = URL.createObjectURL(file);
        await this.loadHDRFromBuffer(buffer, file.name, jp2BlobUrl);
        return;
      } catch (err) {
        if (jp2BlobUrl) URL.revokeObjectURL(jp2BlobUrl);
        console.warn('[FileSource] JP2 loading failed, falling back to standard loading:', err);
        // Fall through to standard image loading
      }
    }

    // Check if this is a RAW file - extract embedded JPEG preview
    if (isRAWExtension(file.name)) {
      let rawBlobUrl: string | null = null;
      try {
        const buffer = await file.arrayBuffer();
        const { extractRAWPreview } = await import('../../formats/RAWPreviewDecoder');
        rawBlobUrl = URL.createObjectURL(file);
        const loaded = await this.loadRAWPreview(extractRAWPreview, buffer, file.name, rawBlobUrl);
        if (loaded) return;
        URL.revokeObjectURL(rawBlobUrl);
      } catch (err) {
        if (rawBlobUrl) URL.revokeObjectURL(rawBlobUrl);
        console.warn('[FileSource] RAW preview loading failed, falling back to standard loading:', err);
        // Fall through to standard image loading
      }
    }

    // Standard image loading
    const url = URL.createObjectURL(file);
    await this.load(url, file.name);
  }

  isReady(): boolean {
    // For HDR files (EXR, DPX, Cineon, Float TIFF, Radiance HDR), check if we have cached IPImage
    if (this._isHDRFormat || this.isEXR) {
      return this.cachedIPImage !== null;
    }
    return this.image !== null && this.image.complete;
  }

  /**
   * Check if this source contains HDR (float) data
   */
  isHDR(): boolean {
    return this._isHDRFormat || this.isEXR;
  }

  getElement(_frame: number): HTMLImageElement | null {
    return this.image;
  }

  /**
   * Get a canvas containing the rendered image data
   * This is used for HDR files where there's no HTMLImageElement.
   * The canvas is cached and only re-rendered when the image data changes.
   */
  getCanvas(): HTMLCanvasElement | null {
    if (!this.cachedIPImage) {
      return null;
    }

    // VideoFrame-backed images (HDR AVIF) render via WebGL path only
    if (this.cachedIPImage.videoFrame) {
      return null;
    }

    // Return cached canvas if still valid
    if (this.cachedCanvas && !this.canvasDirty) {
      return this.cachedCanvas;
    }

    // Create or reuse canvas
    if (!this.cachedCanvas) {
      this.cachedCanvas = document.createElement('canvas');
    }

    const canvas = this.cachedCanvas;

    // Resize canvas if dimensions changed
    if (canvas.width !== this.cachedIPImage.width || canvas.height !== this.cachedIPImage.height) {
      canvas.width = this.cachedIPImage.width;
      canvas.height = this.cachedIPImage.height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const sourceData = this.cachedIPImage.getTypedArray();
    const destData = imageData.data;

    // Convert IPImage data to ImageData
    if (this.cachedIPImage.dataType === 'uint8') {
      // Direct copy for uint8 data
      destData.set(sourceData);
    } else if (this.cachedIPImage.dataType === 'float32') {
      // Simple clamp for 2D canvas fallback path.
      // The WebGL Renderer handles proper HDR tone mapping via GPU shaders.
      const floatData = sourceData as Float32Array;
      for (let i = 0; i < floatData.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const v = Math.max(0, Math.min(1, floatData[i + c] ?? 0));
          destData[i + c] = Math.round(Math.pow(v, 1 / 2.2) * 255);
        }
        // Alpha channel: pass through
        destData[i + 3] = Math.round(Math.min(1, Math.max(0, floatData[i + 3] ?? 1)) * 255);
      }
    } else {
      // uint16 - normalize to 0-255
      const uint16Data = sourceData as Uint16Array;
      for (let i = 0; i < uint16Data.length; i++) {
        const value = uint16Data[i] ?? 0;
        destData[i] = Math.round((value / 65535) * 255);
      }
    }

    ctx.putImageData(imageData, 0, 0);
    this.canvasDirty = false;
    return canvas;
  }

  /**
   * Get the cached IPImage directly (for WebGL HDR rendering path)
   */
  getIPImage(): IPImage | null {
    return this.cachedIPImage;
  }

  protected process(context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    if (!this.isReady()) {
      return null;
    }

    // Return cached if valid and not dirty
    if (this.cachedIPImage && !this.dirty) {
      // Update frame number in metadata
      if (this.cachedIPImage.metadata.frameNumber !== context.frame) {
        this.cachedIPImage.metadata.frameNumber = context.frame;
      }
      return this.cachedIPImage;
    }

    // For HDR files, the IPImage is already created during load
    if (this._isHDRFormat || this.isEXR) {
      return this.cachedIPImage;
    }

    // Create IPImage from canvas for standard images
    if (!this.image) {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = this.image.naturalWidth;
    canvas.height = this.image.naturalHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    ctx.drawImage(this.image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    this.cachedIPImage = new IPImage({
      width: imageData.width,
      height: imageData.height,
      channels: 4,
      dataType: 'uint8',
      data: imageData.data.buffer.slice(0),
      metadata: {
        sourcePath: this.url,
        frameNumber: context.frame,
      },
    });

    return this.cachedIPImage;
  }

  override dispose(): void {
    if (this.url.startsWith('blob:')) {
      URL.revokeObjectURL(this.url);
    }
    this.image = null;
    if (this.cachedIPImage) {
      this.cachedIPImage.close();
    }
    this.cachedIPImage = null;
    this.exrBuffer = null;
    this.exrLayers = [];
    this.isEXR = false;
    this._isHDRFormat = false;
    this._formatName = null;
    this._rawExifMetadata = null;
    // Clean up cached canvas
    this.cachedCanvas = null;
    this.canvasDirty = true;
    super.dispose();
  }

  toJSON(): object {
    return {
      type: this.type,
      id: this.id,
      name: this.name,
      // Prefer originalUrl for export if available (preserves file system path)
      url: this.properties.getValue<string>('originalUrl') || this.url,
      metadata: this.metadata,
      properties: this.properties.toJSON(),
      isHDR: this._isHDRFormat || this.isEXR,
    };
  }
}
